// ElevenLabs basics shared by routes (server-only). Model ids: docs/plan/LOOKUPS.md.
import { config } from "./config";

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY missing");
  return k.replace(/^["']|["']$/g, "");
}

export const STT_MODEL = "scribe_v3";

/**
 * Batch speech-to-text. Hindi mixed with English; language auto-detected unless given.
 * `keyterms`: words to bias recognition towards (today's bridge words, English and Hindi, R6.2). Sent as one
 * multipart `keyterms` field per term. Unverified on scribe_v3 at Wave 0: the first caller checks it on production.
 */
export async function stt(
  audio: Blob,
  opts: { filename?: string; languageCode?: string; keyterms?: string[]; signal?: AbortSignal } = {},
): Promise<{ text: string; languageCode: string | null; ms: number }> {
  const t0 = Date.now();
  const fd = new FormData();
  fd.append("model_id", STT_MODEL);
  fd.append("file", audio, opts.filename ?? "audio.webm");
  if (opts.languageCode) fd.append("language_code", opts.languageCode);
  for (const k of opts.keyterms ?? []) if (k.trim()) fd.append("keyterms", k.trim());
  fd.append("tag_audio_events", "true"); // roars and laughs come back as [tags], not as silence
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key() },
    body: fd,
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`stt ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return { text: (j.text ?? "").trim(), languageCode: j.language_code ?? null, ms: Date.now() - t0 };
}

export interface TtsOptions {
  voiceId?: string;
  modelId?: string;
  languageCode?: string;
  outputFormat?: string;
  signal?: AbortSignal;
}

/** Streaming TTS request in Nani's voice by default. Returns the raw streaming Response (audio/mpeg). */
export async function ttsStream(text: string, o: TtsOptions = {}): Promise<Response> {
  const voice = o.voiceId ?? config.nani.voiceId;
  const fmt = o.outputFormat ?? config.nani.outputFormat;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=${fmt}`, {
    method: "POST",
    headers: { "xi-api-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: o.modelId ?? config.nani.voiceModel,
      ...(o.languageCode !== "" ? { language_code: o.languageCode ?? config.nani.languageCode } : {}),
    }),
    signal: o.signal,
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** Whole TTS clip as bytes. */
export async function tts(text: string, o: TtsOptions = {}): Promise<Uint8Array> {
  const res = await ttsStream(text, o);
  return new Uint8Array(await res.arrayBuffer());
}
