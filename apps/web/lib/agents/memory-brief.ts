// The evening brief (PLAN.md C12): one brain call over today's turns and brain.md; Memory posts it and logs the day. Server-only.
import { z } from "zod";
import { brainJson } from "../brain";
import { clockParts, demoNow } from "../clock";
import { config, CHILD_ID } from "../config";
import { getDemoState } from "../demo-state";
import { getLatest, sectionLines } from "../files";
import { post } from "../messages";
import type { Message } from "../types";
import { applyEdit } from "./apply";
import { dayNotes, dayTurns, MEMORY_TONE, turnsText } from "./memory";

const child = config.childName;
const nani = config.grandmaName;
const HEADING = "## Last few days";

const lines = (max: number) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []),
    z.array(z.string().trim().min(1)).min(1).transform((a) => a.slice(0, max)),
  );
const BriefSchema = z.object({
  today: lines(3),
  starters: lines(3),
  summary: z.string().trim().min(1),
});
export type BriefOutput = z.infer<typeof BriefSchema>;

const SYSTEM = `You are Memory, the member of the family group chat who writes ${child}'s (age ${config.age}) evening brief for his parents, from his day with ${nani}, his AI grandma in his soft toy.

${MEMORY_TONE}

Reply with ONE JSON object only: {"today":["..."],"starters":["..."],"summary":"..."}
- today: exactly 3 short lines about today, each under 12 words, taken ONLY from today's turns and notes below (a word he spelled, something he counted, a kind moment). Never invent a moment; brain.md is past days, not today.
- starters: exactly 3 bedtime conversation starters, each a short question a parent can ask ${child} at bedtime, tied to a real moment from today's turns. Write them as the parent would say them, in simple words.
- summary: two short sentences for ${child}'s diary of recent days (what he learned or did, one sweet detail). Plain text on one line, no date, no bullet.
- Language: English with a little Hindi flavour is fine; keep it simple.
- If there are no turns today: today is ONE short, gentle quiet-day line (he hasn't played with ${nani} today, it's fine), starters come from brain.md (things he loves or recently learned), and summary is "Quiet day, no chat with ${nani}."`;

export interface BriefResult {
  ok: true;
  messageId: number;
  toVersion: number;
}

/** Heading, three lines about today, then the starters. */
export function briefText(b: BriefOutput, quiet: boolean): string {
  const heading = quiet ? `Quiet evening for ${child} 🌙` : `Evening! Here's ${child}'s day with ${nani} 🌙`;
  const today = b.today.map((l) => `• ${l}`).join("\n");
  const starters = b.starters.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `${heading}\n${today}\n\nAsk him at bedtime:\n${starters}`;
}

/** Runs the whole brief: brain call, file log (compare-and-swap), chat message. Throws if the brain fails twice. */
export async function runBrief(): Promise<BriefResult> {
  const demo = await getDemoState(CHILD_ID);
  const now = clockParts(demoNow(demo.clock_offset_ms));
  const [brain, turns, notes] = await Promise.all([getLatest(CHILD_ID, "brain"), dayTurns(CHILD_ID), dayNotes(CHILD_ID)]);
  const quiet = turns.length === 0;

  const user = `Today is ${now.dayLabel}.${quiet ? `\nThere were NO turns with ${nani} today. Do not describe any activity from today.` : ""}

TODAY'S TURNS WITH ${child.toUpperCase()}
${turnsText(turns)}

${nani.toUpperCase()}'S NOTES TODAY
${notes.length ? notes.map((n) => `- ${n}`).join("\n") : "(none)"}

BRAIN.MD
${brain.content.trim()}

Write the brief now. JSON only.`;

  let out: BriefOutput | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 2 && !out; attempt++) {
    try {
      const raw = await brainJson({
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        maxTokens: 600,
        label: "memory-brief",
        signal: AbortSignal.timeout(25_000),
      });
      const r = BriefSchema.safeParse(raw);
      if (r.success) out = r.data;
      else lastErr = r.error.message.slice(0, 200);
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  if (!out) throw new Error(`brief: brain failed: ${lastErr}`);
  // A quiet day never lists moments, whatever the model wrote.
  if (quiet) out = { ...out, today: [`No playtime with ${nani} today, and that's okay.`] };

  // Dated summary under "Last few days": one line per day, so a second brief today replaces the first. A quiet day adds nothing.
  let meta: Message["meta"] = { kind: "brief" };
  let toVersion = brain.version;
  if (!quiet) {
    const oneLine = out.summary.replace(/\s+/g, " ");
    const mine = sectionLines(brain.content, HEADING).filter((l) => l.replace(/^[-*]\s*/, "").startsWith(`${now.dayLabel}:`));
    const w = await applyEdit(
      CHILD_ID,
      "memory",
      { section: HEADING, add: [`- ${now.dayLabel}: ${oneLine}`], remove: mine },
      `Evening brief, ${now.dayLabel}`,
    );
    if (w) {
      toVersion = w.toVersion;
      if (w.changed) {
        meta = {
          kind: "brief",
          file: "brain",
          fromVersion: w.fromVersion,
          toVersion: w.toVersion,
          changedLines: w.changedLines,
          ...(w.removedLines.length ? { removedLines: w.removedLines } : {}),
        };
      }
    }
  }

  const msg = await post(CHILD_ID, "memory", "bot", briefText(out, quiet), meta);
  return { ok: true, messageId: msg.id, toVersion };
}
