// Browser side of the call (N2): record a clip, turn it into a WAV that every browser plays, send it,
// and call /api/call. Used by /toy (use-call.ts) and the chat's call panel.
//
// Why WAV: Chrome records webm/opus, Safari records mp4/aac, and neither plays the other's everywhere
// (iPhone Safari and webm, Chromium builds and aac). The recording browser can always decode its own
// recording, so it decodes it once (OfflineAudioContext, resampled to 16 kHz mono) and sends PCM WAV,
// which plays in every browser, in <audio> and in Web Audio. 16 kHz mono is 32 KB/s: a 5 s clip is 160 KB.
// If decoding fails, the original recording is sent as is.
import { MAX_CLIP_MS, MIN_CLIP_MS, type CallFrom, type CallState, type CallWho } from "./shared";

const WAV_RATE = 16_000;

export function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export interface Recorded {
  blob: Blob;
  heldMs: number;
}

/** One hold of the talk button. start() with an open mic stream; stop() resolves with the clip (or null). */
export class ClipRecorder {
  private rec: MediaRecorder | null = null;
  private parts: Blob[] = [];
  private at = 0;
  private cap: ReturnType<typeof setTimeout> | null = null;
  private done: Promise<Blob> | null = null;

  get active(): boolean {
    return !!this.rec;
  }

  start(stream: MediaStream, onCap?: () => void): boolean {
    if (this.rec) return true;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      console.warn("[call] recorder failed", e);
      return false;
    }
    const parts: Blob[] = [];
    this.parts = parts;
    rec.ondataavailable = (e) => {
      if (e.data.size) parts.push(e.data);
    };
    this.done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(parts, { type: rec.mimeType || mime || "audio/webm" }));
    });
    rec.start();
    this.rec = rec;
    this.at = performance.now();
    this.cap = setTimeout(() => onCap?.(), MAX_CLIP_MS);
    return true;
  }

  /** Stop. Null for a tap (shorter than MIN_CLIP_MS) or an empty recording. */
  async stop(): Promise<Recorded | null> {
    const rec = this.rec;
    if (!rec) return null;
    this.rec = null;
    if (this.cap) clearTimeout(this.cap);
    const heldMs = Math.round(performance.now() - this.at);
    try {
      rec.stop();
    } catch {}
    const blob = await this.done!;
    if (heldMs < MIN_CLIP_MS || blob.size < 500) return null;
    return { blob, heldMs };
  }

  cancel(): void {
    const rec = this.rec;
    this.rec = null;
    if (this.cap) clearTimeout(this.cap);
    try {
      rec?.stop();
    } catch {}
  }
}

// ---------- WAV ----------

type OfflineCtor = typeof OfflineAudioContext;

async function decodeAt(bytes: ArrayBuffer, rate: number): Promise<AudioBuffer> {
  const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const Ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctor) throw new Error("no OfflineAudioContext");
  const ctx = new Ctor(1, 1, rate);
  // Old Safari only has the callback form; newer browsers return a promise too.
  return new Promise<AudioBuffer>((resolve, reject) => {
    const p = ctx.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined;
    p?.catch(reject);
  });
}

function encodeWav(buf: AudioBuffer): Blob {
  const n = buf.length;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i));
  };
  const rate = buf.sampleRate;
  str(0, "RIFF");
  out.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const ch of chans) v += ch[i];
    v = Math.max(-1, Math.min(1, v / chans.length));
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([out.buffer], { type: "audio/wav" });
}

/** The recording as 16 kHz mono WAV; the original blob if this browser can't decode it. */
export async function toWav(blob: Blob): Promise<Blob> {
  if (/wav/.test(blob.type)) return blob;
  try {
    return encodeWav(await decodeAt(await blob.arrayBuffer(), WAV_RATE));
  } catch (e) {
    console.warn("[call] wav conversion failed, sending the original", e);
    return blob;
  }
}

const extOf = (type: string) =>
  type.includes("wav") ? "wav" : type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("mpeg") ? "mp3" : "webm";

// ---------- API ----------

export interface ClipSent {
  url: string;
  ms: { wav: number; upload: number; store: number; broadcast: number; total: number };
  bytes: number;
}

/** WAV-convert and POST /api/clip. Logs each hop: wav conversion, upload (server: store + broadcast). */
export async function sendClip(r: Recorded, callId: string, from: CallFrom, sender: string): Promise<ClipSent | null> {
  const t0 = performance.now();
  const wav = await toWav(r.blob);
  const t1 = performance.now();
  const fd = new FormData();
  fd.append("file", wav, `clip.${extOf(wav.type)}`);
  fd.append("callId", callId);
  fd.append("from", from);
  fd.append("sender", sender);
  try {
    const res = await fetch("/api/clip", { method: "POST", body: fd });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; ms?: { store: number; broadcast: number } };
    const t2 = performance.now();
    if (!res.ok || !j.ok || !j.url) throw new Error(`clip ${res.status}`);
    const sent: ClipSent = {
      url: j.url,
      bytes: wav.size,
      ms: {
        wav: Math.round(t1 - t0),
        upload: Math.round(t2 - t1),
        store: j.ms?.store ?? -1,
        broadcast: j.ms?.broadcast ?? -1,
        total: Math.round(t2 - t0),
      },
    };
    console.log(
      `[call] clip sent from ${from}: held ${r.heldMs} ms, ${Math.round(wav.size / 1024)} KB ${wav.type}; ` +
        `wav ${sent.ms.wav} ms, upload ${sent.ms.upload} ms (store ${sent.ms.store}, broadcast ${sent.ms.broadcast}), release→announced ${sent.ms.total} ms`,
    );
    return sent;
  } catch (e) {
    console.warn("[call] clip failed", e);
    return null;
  }
}

export interface CallReply {
  ok: boolean;
  callId?: string;
  state?: CallState;
  who?: CallWho;
  joinedBy?: string;
  error?: string;
}

export async function callApi(
  action: "start" | "join" | "end",
  body: { callId?: string | null; who?: CallWho; sender?: string; reason?: string },
): Promise<CallReply> {
  const t0 = performance.now();
  try {
    const res = await fetch("/api/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const j = (await res.json().catch(() => ({}))) as CallReply;
    console.log(`[call] ${action} ${res.status} in ${Math.round(performance.now() - t0)} ms`);
    return { ...j, ok: res.ok && j.ok !== false };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
