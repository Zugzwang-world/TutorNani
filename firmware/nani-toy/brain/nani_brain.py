"""Nani's brain, running on the laptop. Bridges the toy (ESP32) and the Nani website.

The ESP32 (firmware/nani-full) records what the child says and sends it here over Wi-Fi.

Default (website mode):
  * sends the speech to the website's /api/turn, which hears, thinks (the senior's agents and
    memory) and speaks in Nani's voice; forwards each sentence to the toy as soon as it arrives
  * keeps the website's stage page open in a hidden, muted Edge window and forwards anything
    Nani says there (reminders, songs) to the toy  ("mirror")
  * finds the toy on the Wi-Fi by itself (tries every address for port 3333)
  Note: this uses the website's live service, so turns appear in its memory and use its API credits.

--offline: no website. faster-whisper (hear) + Ollama qwen3 (think) + Windows Zira (speak).

Run:   python nani_brain.py                 (or double-click "start-nani.bat")
       python nani_brain.py --offline       (laptop-only brain)
       python nani_brain.py --host 192.168.0.187 --no-mirror --show   (other options)
Stop:  Ctrl+C

Messages on the TCP link (4-byte tag + 4-byte little-endian length + data):
  ESP32 -> laptop : UTT1 = 16 kHz mono 16-bit speech
  laptop -> ESP32 : HRD1 = text heard, ANS1 = Nani's answer text, RPL1 = answer audio
                    (ANS1 + RPL1 can repeat, one pair per sentence), END1 = answer finished
                    SAY1 = website speech follows (then RPL1 pieces, then END1)
"""
import argparse
import json
import re
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))   # make_voice.py lives next to this file
import make_voice  # noqa: E402  (Zira voice + bass cut + loudness boost, same as the greeting)

RATE = 16000
OLLAMA = "http://localhost:11434"
MAX_REPLY_SECONDS = 15

SYSTEM_PROMPT = (
    "You are Nani, a warm, loving Indian grandmother who lives inside a soft toy. "
    "You are talking to Aarav, a 4-year-old boy. Answer in simple English a small child understands, "
    "in 1 or 2 short sentences, under 30 words. Be kind, playful and encouraging. "
    "You may sometimes call him 'beta'. Never use emojis, lists, or markdown. "
    "You are a toy: you cannot see, show, move or fetch anything, so never offer to. "
    "If you did not understand, gently ask him to say it again."
)


# ---------- link helpers ----------
def recv_exact(sock, n):
    data = bytearray()
    while len(data) < n:
        chunk = sock.recv(min(65536, n - len(data)))
        if not chunk:
            raise ConnectionError("ESP32 closed the connection")
        data += chunk
    return bytes(data)


def send_msg(sock, tag: bytes, payload: bytes):
    sock.sendall(tag + struct.pack("<I", len(payload)) + payload)


# ---------- 1. hear ----------
def load_whisper(name):
    from faster_whisper import WhisperModel
    print(f"Loading speech recognition ({name})...")
    return WhisperModel(name, device="cpu", compute_type="int8")


def hear(model, pcm: np.ndarray, english_only: bool) -> str:
    audio = pcm.astype(np.float32) / 32768.0
    segs, _ = model.transcribe(audio, language="en" if english_only else None, beam_size=1)
    return " ".join(s.text.strip() for s in segs).strip()


# ---------- 2. think ----------
def ollama_up() -> bool:
    try:
        urllib.request.urlopen(OLLAMA + "/api/tags", timeout=2)
        return True
    except OSError:
        return False


def ensure_ollama():
    if ollama_up():
        return
    print("Starting Ollama in the background...")
    subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    for _ in range(30):
        if ollama_up():
            return
        time.sleep(1)
    raise SystemExit("Ollama did not start. Open the Ollama app, then run this again.")


def think(model: str, history: list, heard: str) -> str:
    history.append({"role": "user", "content": heard})
    body = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + history[-8:],
        "stream": False,
        "think": False,
        "options": {"temperature": 0.7, "num_predict": 80},
    }
    req = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = json.loads(r.read())["message"]["content"]
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)        # in case the model still "thinks"
    text = re.sub(r"[*_#`>\[\]]", "", text)                            # no markdown symbols for the voice
    text = text.encode("ascii", "ignore").decode().strip() or "Say that again, beta?"
    history.append({"role": "assistant", "content": text})
    return text


# ---------- 3. speak ----------
def speak(text: str) -> np.ndarray:
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "a.wav"
        make_voice.synthesize(text, "Zira", -1, p)
        with wave.open(str(p)) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64)
    loud = np.where(np.abs(a) > 300)[0]
    if loud.size:
        a = a[max(0, loud[0] - 800): loud[-1] + 800]
    a = a[: RATE * MAX_REPLY_SECONDS]
    return np.clip(make_voice.compress(make_voice.bass_cut(a)) * 28000, -32768, 32767).astype("<i2")


# ---------- website mode: the senior's backend does hear + think + speak ----------
def to_wav_bytes(pcm: np.ndarray) -> bytes:
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.astype("<i2").tobytes())
    return buf.getvalue()


def decode_audio(blob: bytes) -> np.ndarray:
    """Any audio file (mp3/opus/wav...) -> 16 kHz mono 16-bit, using ffmpeg."""
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1",
                        "-ar", str(RATE), "pipe:1"], input=blob, capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype="<i2")


def for_speaker(audio: np.ndarray) -> np.ndarray:
    """Bass cut + loudness boost, the same treatment as the greeting, for the toy's small speaker."""
    a = audio.astype(np.float64)[: RATE * MAX_REPLY_SECONDS]
    if not a.size:
        return np.zeros(0, "<i2")
    return np.clip(make_voice.compress(make_voice.bass_cut(a)) * 28000, -32768, 32767).astype("<i2")


def site_turn_stream(site: str, session_id: str, pcm: np.ndarray):
    """Send the child's speech to /api/turn and yield events AS THEY ARRIVE:
       ("heard", text, secs), ("say", text, audio, secs), ("fallback", id, secs)."""
    import base64
    import requests
    t0 = time.time()
    files = {"audio": ("turn.wav", to_wav_bytes(pcm), "audio/wav")}
    data = {"sessionId": session_id, "board": json.dumps({"spell": None, "showing": None}),
            "lastEvent": "null", "clockOffsetMs": "0"}
    def lines_as_they_arrive(resp):
        # iter_lines() waits to fill a 512-byte buffer, which held each event back until the next one.
        # iter_content(None) hands over whatever has arrived, straight away.
        buf = b""
        for chunk in resp.iter_content(chunk_size=None):
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                yield line.decode("utf-8", "ignore")
        if buf.strip():
            yield buf.decode("utf-8", "ignore")

    with requests.post(site.rstrip("/") + "/api/turn", files=files, data=data, stream=True, timeout=60) as r:
        r.raise_for_status()
        for line in lines_as_they_arrive(r):
            if not line or not line.strip():
                continue
            ev = json.loads(line)
            kind = ev.get("t")
            if kind == "heard":
                yield ("heard", ev.get("text", ""), time.time() - t0)
            elif kind == "say":
                text = ev.get("text", "")
                if ev.get("audio"):
                    audio = for_speaker(decode_audio(base64.b64decode(ev["audio"])))
                elif text:
                    audio = speak(text)                          # text but no audio: use Zira
                else:
                    continue
                yield ("say", text, audio, time.time() - t0)
            elif kind == "fallback":
                yield ("fallback", ev.get("id", "fallback"), time.time() - t0)
            elif kind == "done":
                break


def site_turn(site: str, session_id: str, pcm: np.ndarray):
    """Whole answer at once: (heard, answer, reply_pcm). Used for quick tests."""
    heard, texts, chunks = "", [], []
    for ev in site_turn_stream(site, session_id, pcm):
        if ev[0] == "heard":
            heard = ev[1]
        elif ev[0] == "say":
            texts.append(ev[1]); chunks.append(ev[2])
    if not chunks:
        raise RuntimeError("website sent no answer")
    return heard, " ".join(texts).strip(), np.concatenate(chunks)


# ---------- website speaks through the toy: mirror the stage page's audio ----------
# The stage page plays reminders, songs and Nani's lines through ONE Web Audio player.
# We open it in a hidden, muted Edge window and copy every sound it starts.
HOOK_JS = r"""
(() => {
  const orig = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    try {
      const b = this.buffer;
      if (b && b.duration > 0.15 && window.__naniToToy) {
        const sr = b.sampleRate, c0 = b.getChannelData(0);
        let mono = c0;
        if (b.numberOfChannels > 1) {
          const c1 = b.getChannelData(1); mono = new Float32Array(c0.length);
          for (let i = 0; i < c0.length; i++) mono[i] = (c0[i] + c1[i]) / 2;
        }
        const off = Math.floor((args[1] || 0) * sr);
        const end = args[2] ? off + Math.floor(args[2] * sr) : mono.length;
        const seg = mono.slice(off, end);
        const bytes = new Uint8Array(seg.buffer);
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        window.__naniToToy({ sr: sr, data: btoa(s) });
      }
    } catch (e) {}
    return orig.apply(this, args);
  };
})();
"""


def stage_audio_to_pcm(payload: dict) -> np.ndarray:
    """Browser audio (float32 at the page's sample rate) -> 16 kHz int16 for the toy's speaker."""
    import base64
    from math import gcd
    from scipy.signal import resample_poly
    x = np.frombuffer(base64.b64decode(payload["data"]), dtype="<f4").astype(np.float64)
    sr = int(payload["sr"])
    if sr != RATE:
        g = gcd(RATE, sr)
        x = resample_poly(x, RATE // g, sr // g)
    return for_speaker(x * 32767)


def stage_mirror(site: str, out_q, stop, show: bool):
    """Runs in its own thread: keeps the stage page open and queues every sound it plays."""
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="msedge", headless=not show, args=[
                "--mute-audio",                                   # don't play on the laptop
                "--autoplay-policy=no-user-gesture-required",
                "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
            ctx = browser.new_context(permissions=["microphone"])
            ctx.expose_binding("__naniToToy", lambda _src, payload: out_q.put(payload))
            ctx.add_init_script(HOOK_JS)
            page = ctx.new_page()
            page.goto(site.rstrip("/") + "/stage", wait_until="domcontentloaded")
            page.get_by_text("Tap to wake Nani").first.click(timeout=30000)   # unlocks the page's audio
            print("Website mirror: stage page is open; Nani's website speech will play on the toy.")
            while not stop.is_set():
                page.wait_for_timeout(500)
            browser.close()
    except Exception as e:
        print(f"Website mirror stopped: {e}")


def send_website_speech(sock, q) -> int:
    """Send any queued website sounds to the toy. Returns how many were sent."""
    import queue as _queue
    sent = 0
    while True:
        try:
            payload = q.get_nowait()
        except _queue.Empty:
            return sent
        audio = stage_audio_to_pcm(payload)
        if audio.size < RATE // 5:                                  # ignore clicks / tiny unlock sounds
            continue
        send_msg(sock, b"SAY1", b"website")
        send_msg(sock, b"RPL1", audio.tobytes())
        send_msg(sock, b"END1", b"")
        print(f"Website -> toy: {audio.size / RATE:.1f} s of Nani's website speech")
        sent += 1


# ---------- find the toy on the Wi-Fi by itself ----------
def find_toy(port: int):
    """Try every address on this laptop's Wi-Fi network for Nani's port. Returns the IP or None."""
    from concurrent.futures import ThreadPoolExecutor
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))                   # no data is sent; just learns which network we're on
        mine = s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()
    base = mine.rsplit(".", 1)[0]

    def probe(ip):
        try:
            with socket.create_connection((ip, port), timeout=0.6):
                return ip
        except OSError:
            return None

    with ThreadPoolExecutor(max_workers=64) as pool:
        for ip in pool.map(probe, [f"{base}.{i}" for i in range(1, 255)]):
            if ip:
                return ip
    return None


# ---------- main loop ----------
def main():
    ap = argparse.ArgumentParser(description="Nani's brain: hear, think, speak")
    ap.add_argument("--host", default="auto", help="ESP32 IP; default 'auto' finds the toy on the Wi-Fi")
    ap.add_argument("--port", type=int, default=3333)
    ap.add_argument("--llm", default="qwen3", help="Ollama model (default qwen3)")
    ap.add_argument("--whisper", default="small.en",
                    help="small.en = English (downloaded). 'small' = Hindi/Hinglish too (downloads ~480 MB once)")
    ap.add_argument("--site", default="https://tutor-grandma.vercel.app",
                    help="the Nani website whose backend answers (default: tutor-grandma.vercel.app)")
    ap.add_argument("--offline", action="store_true",
                    help="don't use the website: answer with the laptop's own Whisper + Ollama + Zira")
    ap.add_argument("--no-mirror", action="store_true",
                    help="don't play the website's own speech (reminders, songs...) on the toy")
    ap.add_argument("--show", action="store_true", help="show the hidden stage page window (for debugging)")
    args = ap.parse_args()
    if args.offline:
        args.site = None
    args.mirror = bool(args.site) and not args.no_mirror

    import queue
    import select
    import threading
    website_q, stop = queue.Queue(), threading.Event()
    if args.mirror:
        threading.Thread(target=stage_mirror, args=(args.site, website_q, stop, args.show), daemon=True).start()

    history = []
    stt = None
    if args.site:
        import uuid
        session_id = str(uuid.uuid4())
        print(f"WEBSITE MODE: answers come from {args.site}/api/turn (session {session_id[:8]})")
    else:
        ensure_ollama()
        stt = load_whisper(args.whisper)
        print(f"Warming up {args.llm} (first time can take ~20 s)...")
        think(args.llm, [], "Hello")

    while True:
        host = args.host
        if host == "auto":
            print("Looking for Nani on the Wi-Fi...")
            host = find_toy(args.port)
            if not host:
                print("  not found yet (is the toy powered and on the same Wi-Fi?). Trying again in 3 s")
                time.sleep(3)
                continue
        print(f"Connecting to Nani at {host}:{args.port} ...")
        try:
            sock = socket.create_connection((host, args.port), timeout=5)
        except OSError as e:
            print(f"  can't reach the ESP32 ({e}). Same Wi-Fi? Retrying in 3 s")
            time.sleep(3)
            continue
        sock.settimeout(None)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        print("Connected. Talk to Nani! (Ctrl+C to stop)\n")
        while not website_q.empty():                                 # don't replay old website speech
            website_q.get_nowait()
        try:
            while True:
                # Nothing from the toy yet? Pass on anything the website said meanwhile.
                ready, _, _ = select.select([sock], [], [], 0.2)
                if not ready:
                    send_website_speech(sock, website_q)
                    continue
                tag = recv_exact(sock, 4)
                n = struct.unpack("<I", recv_exact(sock, 4))[0]
                data = recv_exact(sock, n)
                if tag != b"UTT1":
                    continue
                t0 = time.time()
                pcm = np.frombuffer(data, dtype="<i2")
                if args.site:
                    said = 0
                    try:
                        # Forward each piece the moment it arrives, so the toy starts speaking early.
                        for ev in site_turn_stream(args.site, session_id, pcm):
                            if ev[0] == "heard":
                                print(f"Aarav: {ev[1] or '(nothing clear)'}   [heard at {ev[2]:.1f} s]")
                                send_msg(sock, b"HRD1", ev[1].encode("utf-8", "ignore"))
                            elif ev[0] == "say":
                                _, text, audio, secs = ev
                                print(f"Nani : {text}   [piece {said + 1} at {secs:.1f} s, {audio.size / RATE:.1f} s long]")
                                send_msg(sock, b"ANS1", text.encode("utf-8", "ignore"))
                                send_msg(sock, b"RPL1", audio.tobytes())
                                said += 1
                            elif ev[0] == "fallback":
                                print(f"Website fallback: {ev[1]}   [at {ev[2]:.1f} s]")
                    except Exception as e:                          # website down / slow: say so
                        print(f"Website error: {e}")
                    if not said:
                        answer = "Sorry beta, Nani cannot reach her brain right now. Try again?"
                        send_msg(sock, b"ANS1", answer.encode())
                        send_msg(sock, b"RPL1", speak(answer).tobytes())
                    send_msg(sock, b"END1", b"")
                    print(f"       (answer complete in {time.time() - t0:.1f} s)\n")
                    continue
                heard = hear(stt, pcm, args.whisper.endswith(".en"))
                print(f"Aarav: {heard or '(nothing clear)'}")
                send_msg(sock, b"HRD1", heard.encode("utf-8", "ignore"))
                answer = think(args.llm, history, heard) if heard else "I could not hear you, beta. Say it again?"
                print(f"Nani : {answer}")
                send_msg(sock, b"ANS1", answer.encode("utf-8", "ignore"))
                reply = speak(answer)
                send_msg(sock, b"RPL1", reply.tobytes())
                send_msg(sock, b"END1", b"")
                print(f"       ({reply.size / RATE:.1f} s of speech, answered in {time.time() - t0:.1f} s)\n")
        except (OSError, ConnectionError) as e:
            print(f"Connection lost ({e}). Reconnecting...")
        finally:
            sock.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
