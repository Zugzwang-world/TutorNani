// What Nani says out loud, and the live speech check (PLAN.md C2, C8). Pure; safe on client and server.

/** Remove what a voice should not read: emoji, markdown symbols, brackets. Markers must already be stripped. */
export function cleanSpeech(text: string): string {
  return text
    .replace(/^\s*(Nani|नानी)\s*:\s*/i, "") // a reply that starts "Nani: …"
    .replace(/\*[^*\n]{1,40}\*/g, " ") // stage directions like *smiles*
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/[*_#~`<>{}[\]|\\]/g, "")
    .replace(/\s+([,.!?…।])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Bytes per second of an ElevenLabs mp3 format like "mp3_44100_64" (64 kbps -> 8000 B/s). */
export function mp3BytesPerSecond(outputFormat: string): number {
  const kbps = parseInt(outputFormat.split("_").pop() ?? "", 10);
  return Number.isFinite(kbps) && kbps > 0 ? (kbps * 1000) / 8 : 8000;
}

export interface SpeechCheck {
  ok: boolean;
  seconds: number; // estimated clip length
  expected: number; // rough expected length for the text
  reason?: "empty" | "too_short";
}

/**
 * Live speech check (C8): a clip is bad if it is empty or much too short for its text.
 * Expect about 14 characters a second; flag under 40% of that, or under 0.25 s.
 */
export function checkClip(bytes: number, text: string, outputFormat: string): SpeechCheck {
  const seconds = bytes / mp3BytesPerSecond(outputFormat);
  const expected = text.replace(/\s+/g, " ").trim().length / 14;
  if (bytes < 200) return { ok: false, seconds, expected, reason: "empty" };
  if (seconds < 0.25 || seconds < expected * 0.4) return { ok: false, seconds, expected, reason: "too_short" };
  return { ok: true, seconds, expected };
}
