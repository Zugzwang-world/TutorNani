// Where a pre-made clip may stop early (PLAN.md C5). Pure; safe on client and server.
//
// When Nani's reply is ready while a learning filler is still playing, the filler stops at its next
// sentence end instead of playing to the end (a filler is 2 to 5 s; the reply usually arrives ~1 s in).
// Pauses come from the audio itself, so they stay right when clips are regenerated. The text decides
// which pauses are sentence ends: the N longest pauses, for the N breaks in the text. Only a break after
// `. ! ?` may be cut; never after `:` ("Bolo: …"), `…` ("saans lo… aur chhodo") or inside a count.

export interface Pause {
  start: number; // seconds into the clip
  end: number;
}

const FRAME_S = 0.01;
const SILENT_RMS = 0.0178; // -35 dBFS
const MIN_PAUSE_S = 0.18;

/** Silent gaps inside a clip (not at its very start or end). */
export function findPauses(samples: Float32Array, sampleRate: number): Pause[] {
  const frame = Math.max(1, Math.round(sampleRate * FRAME_S));
  const frames = Math.floor(samples.length / frame);
  const out: Pause[] = [];
  let runStart = -1;
  let heardSound = false;
  for (let f = 0; f <= frames; f++) {
    let silent = false;
    if (f < frames) {
      let sum = 0;
      for (let k = f * frame; k < (f + 1) * frame; k++) sum += samples[k] * samples[k];
      silent = Math.sqrt(sum / frame) < SILENT_RMS;
    }
    if (silent && heardSound) {
      if (runStart < 0) runStart = f;
      continue;
    }
    if (!silent && f < frames) {
      if (runStart >= 0 && (f - runStart) * FRAME_S >= MIN_PAUSE_S) out.push({ start: runStart * FRAME_S, end: f * FRAME_S });
      heardSound = true;
    }
    runStart = -1; // a run that reaches the end of the clip is trailing silence, not a pause
  }
  return out;
}

/** The pauses where this clip may stop: sentence ends after `. ! ?`, matched to the audio. */
export function cutPoints(text: string | undefined, pauses: Pause[]): Pause[] {
  if (!text) return [];
  const breaks = [...text.matchAll(/[.!?…:;]+["”’]?(?=\s+\S)/g)].map((m) => /[.!?]/.test(m[0]) && !/[…:;]/.test(m[0]));
  if (!breaks.length || pauses.length < breaks.length) return [];
  const longest = [...pauses]
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, breaks.length)
    .sort((a, b) => a.start - b.start);
  return longest.filter((_, k) => breaks[k]);
}

/**
 * When to stop a clip that is at `pos` seconds (of `duration`), or null to let it finish: the first cut
 * point at least `floor` s in, still ahead of us, that saves at least `minSave` s. The stop lands inside
 * the pause, a beat after the sentence ends.
 */
export function stopTime(cuts: Pause[], pos: number, duration: number, floor = 1.0, minSave = 0.5): number | null {
  for (const p of cuts) {
    if (p.start < floor || p.end - 0.05 <= pos) continue;
    const at = Math.max(pos, Math.min(p.start + 0.15, p.end - 0.03));
    if (duration - at >= minSave) return at;
  }
  return null;
}
