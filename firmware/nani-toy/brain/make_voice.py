"""Turn a sentence into audio the ESP32 can play (writes nani_voice.h).

Run:   python make_voice.py "Hello Aarav! I am Nani. Did you drink water today?"
Then upload firmware/nani-full (and firmware/tests/speaker-test) again.

Uses the offline Windows voice (Microsoft Zira by default), 16 kHz mono 16-bit.
Also saves a preview .wav in Wispr\\recordings so you can hear it on the laptop first.
"""
import argparse
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

HERE = Path(__file__).resolve().parent
RATE = 16000
HPF_HZ = 400.0          # same bass cut as the ESP32 (raised from 280 for more clean volume)


def bass_cut(x: np.ndarray) -> np.ndarray:
    """400 Hz high-pass, identical to the filter in the firmware (nani-full.ino, speaker-test.ino)."""
    w0 = 2 * np.pi * HPF_HZ / RATE
    al, c = np.sin(w0) / (2 * 0.7071), np.cos(w0)
    b = np.array([(1 + c) / 2, -(1 + c), (1 + c) / 2]) / (1 + al)
    a = np.array([1 + al, -2 * c, 1 - al]) / (1 + al)
    return lfilter(b, a, x)


def compress(x: np.ndarray, thresh_db=-26.0, ratio=4.0, attack_ms=5.0, release_ms=80.0) -> np.ndarray:
    """Make quiet syllables closer to loud ones, so speech sounds louder at the same peak."""
    x = x / max(np.abs(x).max(), 1e-9)                      # -1 .. 1
    att = np.exp(-1.0 / (RATE * attack_ms / 1000))
    rel = np.exp(-1.0 / (RATE * release_ms / 1000))
    env = np.empty_like(x)
    e = 0.0
    for i, v in enumerate(np.abs(x)):                       # follow the loudness
        e = att * e + (1 - att) * v if v > e else rel * e + (1 - rel) * v
        env[i] = e
    level_db = 20 * np.log10(env + 1e-9)
    gain_db = -np.maximum(level_db - thresh_db, 0) * (1 - 1 / ratio)
    y = x * 10 ** (gain_db / 20)
    # Softly round off only the rarest 0.5% of peaks, so the rest of the voice can come up.
    # (Measured on the test sentence: +7.7 dB louder at the same peak level.)
    ref = max(np.percentile(np.abs(y), 99.5), 1e-9)
    y = np.tanh(1.2 * y / ref) / np.tanh(1.2)
    return y / max(np.abs(y).max(), 1e-9)


def speech_rms_db(pcm: np.ndarray) -> float:
    """Loudness of the speech parts only (ignores the gaps between words)."""
    f = pcm[: pcm.size // 320 * 320].astype(np.float32).reshape(-1, 320)
    r = np.sqrt((f ** 2).mean(axis=1))
    r = r[r > r.max() * 0.1]
    return 20 * np.log10(np.sqrt((r ** 2).mean()) / 32768)


MAC_VOICES = {"Zira": "Samantha", "David": "Daniel"}   # closest built-in macOS voices


def synthesize(text: str, voice: str, rate: int, wav_path: Path):
    """Text -> 16 kHz mono 16-bit WAV. Windows: Zira via System.Speech. macOS: `say`. Linux: espeak-ng."""
    if sys.platform == "darwin":
        _synthesize_mac(text, voice, rate, wav_path)
    elif sys.platform.startswith("win"):
        _synthesize_windows(text, voice, rate, wav_path)
    else:
        _synthesize_other(text, rate, wav_path)


def _to_wav16k(src: Path, wav_path: Path):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-ac", "1", "-ar", str(RATE),
                    "-sample_fmt", "s16", str(wav_path)], check=True)


def _synthesize_mac(text: str, voice: str, rate: int, wav_path: Path):
    aiff = wav_path.with_suffix(".aiff")
    wpm = str(175 + 15 * rate)                        # Windows rate -10..10 -> words per minute
    cmd = ["say", "-v", MAC_VOICES.get(voice, voice), "-r", wpm, "-o", str(aiff), text]
    if subprocess.run(cmd, capture_output=True).returncode != 0:      # voice not installed: default voice
        subprocess.run(["say", "-r", wpm, "-o", str(aiff), text], check=True)
    _to_wav16k(aiff, wav_path)


def _synthesize_other(text: str, rate: int, wav_path: Path):
    raw = wav_path.with_suffix(".raw.wav")
    subprocess.run(["espeak-ng", "-s", str(175 + 15 * rate), "-w", str(raw), text], check=True)
    _to_wav16k(raw, wav_path)


def _synthesize_windows(text: str, voice: str, rate: int, wav_path: Path):
    safe = text.replace("'", "''")
    ps = (
        "Add-Type -AssemblyName System.Speech;"
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        f"$s.SelectVoice('Microsoft {voice} Desktop');"
        f"$s.Rate = {rate};"
        "$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo("
        f"{RATE}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,"
        " [System.Speech.AudioFormat.AudioChannel]::Mono);"
        f"$s.SetOutputToWaveFile('{wav_path}', $fmt);"
        f"$s.Speak('{safe}');"
        "$s.Dispose()"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)


def main():
    ap = argparse.ArgumentParser(description="Make nani_voice.h from a sentence")
    ap.add_argument("text", help="the sentence Nani should say")
    ap.add_argument("--voice", default="Zira", choices=["Zira", "David"], help="Windows voice")
    ap.add_argument("--speed", type=int, default=-1, help="-10 (slow) .. 10 (fast), default -1")
    ap.add_argument("--no-compress", action="store_true", help="skip the loudness boost (to compare)")
    ap.add_argument("--name", default="NANI",
                    help="clip name: NANI = the greeting (nani_voice.h); e.g. FILLER -> nani_filler.h")
    args = ap.parse_args()
    name = args.name.upper()
    file_name = "nani_voice.h" if name == "NANI" else f"nani_{name.lower()}.h"

    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "voice.wav"
        synthesize(args.text, args.voice, args.speed, raw)
        with wave.open(str(raw)) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32)

    # Trim silence at both ends, keep 50 ms.
    loud = np.where(np.abs(a) > 300)[0]
    if loud.size:
        a = a[max(0, loud[0] - 800): loud[-1] + 800]

    plain = np.clip(a * 28000 / max(np.abs(a).max(), 1), -32768, 32767).astype(np.int16)
    if args.no_compress:
        pcm = plain
    else:
        # Bass cut first (so the peak isn't wasted on bass the speaker can't play), then compress.
        pcm = np.clip(compress(bass_cut(a)) * 28000, -32768, 32767).astype(np.int16)
        before = speech_rms_db(np.clip(bass_cut(plain.astype(np.float64)), -32768, 32767))
        after = speech_rms_db(pcm)
        print(f"Loudness: {before:.1f} dB -> {after:.1f} dB  (+{after - before:.1f} dB louder at the same peak)")

    preview = HERE.parent / "recordings" / file_name.replace(".h", "_preview.wav")
    preview.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(preview), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes())

    lines = [", ".join(str(int(v)) for v in pcm[i:i + 16]) for i in range(0, pcm.size, 16)]
    content = (
        "// Generated by make_voice.py. Do not edit by hand.\n"
        f"// Text: {args.text}\n"
        f"// Voice: Microsoft {args.voice}, {RATE} Hz mono 16-bit, {pcm.size / RATE:.2f} s\n"
        "#pragma once\n#include <stdint.h>\n"
        f'static const char {name}_TEXT[] = "{args.text.replace(chr(34), chr(39))}";\n'
        f"static const uint32_t {name}_VOICE_LEN = {pcm.size};\n"
        f"static const int16_t {name}_VOICE[] = {{\n  " + ",\n  ".join(lines) + "\n};\n"
    )
    print(f"Sentence: {args.text}")
    print(f"Length: {pcm.size / RATE:.2f} s ({pcm.size * 2 // 1024} KB in the ESP32's flash)")
    # Every sketch that plays the greeting gets the same file (other clips go to nani-full only).
    folders = [HERE.parent / "nani-full"]   # TutorNani layout: firmware/nani-toy/nani-full
    for folder in folders:
        if folder.is_dir():
            header = folder / file_name
            header.write_text(content, encoding="utf-8")
            print(f"Wrote {header}")
    print(f"Preview on the laptop: {preview}")


if __name__ == "__main__":
    main()
