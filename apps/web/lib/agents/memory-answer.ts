// Memory's answer to a parent's question about the child (PLAN.md C12). Server-only.
// The sorter picks Memory with kind "question"; this call replaces its quick reply with one grounded in today's turns.
// "What should I talk to him about?" gets today's real moments and three bedtime questions (REFINE Part C step 14),
// in the same single brain call. progressViewFor() says which 📈 progress card goes under Memory's reply (R7.5).
import { getToday } from "@/app/api/progress/build";
import { brainComplete } from "../brain";
import { clockParts, demoNow } from "../clock";
import { config, CHILD_ID } from "../config";
import { getDemoState } from "../demo-state";
import { getLatest } from "../files";
import { dayNotes, dayTurns, MEMORY_TONE, turnsText } from "./memory";

const child = config.childName;
const nani = config.grandmaName;

const GROUNDING = `- Only what ${child} himself said or did counts as his: a question ${nani} asked or a number she offered is not his. If the turns don't show it, leave it out.
- Never invent a moment that is not in the turns or notes below.`;

const SYSTEM = `You are Memory, the member of the family group chat who knows ${child} (age ${config.age}) best. A parent asks you about ${child}. Answer from today's turns with ${nani} (his words, her words and the cues: spelled words, counts, cheers), ${nani}'s notes, and brain.md.

${MEMORY_TONE}
- One or two lines, at most 30 words, same language as the parent (English, Hindi or a mix).
- Be specific: pick at most two real moments and name them (the word he spelled, what he counted, who he shared with). Quote his own short words once when you can, exactly as in the turns. Stay under 30 words, the closing question included.
${GROUNDING}
- End with one small thing the parent can ask him, tied to a real moment from today's turns.
- Vary the opening; lead with the moment you're proudest of.
- If there are no turns today, say warmly that he hasn't played with ${nani} yet today and share his last day from "Last few days" in brain.md.
- If the question is about something else (a fact about him), answer it from brain.md; if you don't know, say so kindly.
Reply with the answer text only.`;

const SYSTEM_TALK = `You are Memory, the member of the family group chat who knows ${child} (age ${config.age}) best. A parent on the way home asks what to talk to ${child} about. Answer from today's turns with ${nani} (his words, her words and the cues: spelled words, counts, cheers), ${nani}'s notes, and brain.md.

${MEMORY_TONE}
Answer in exactly this shape, same language as the parent:
- First one or two short lines, at most 30 words, naming today's real moments (at most two): the word he spelled, what he counted, who he shared with. Quote his own short words once when you can, exactly as in the turns.
- Then a line "Ask him at bedtime:" and exactly three numbered questions (1., 2., 3.), each under 12 words, each tied to a different real moment from today's turns or notes.
${GROUNDING}
- If there are no turns today, say warmly that he hasn't played with ${nani} yet today, and tie the three questions to his last day in "Last few days" in brain.md.
Reply with the answer text only.`;

const TALK_ABOUT = /\b(talk|chat|baat)\b[^.?!]*\babout\b|\bwhat (should|can|do) i (talk|say|ask)\b|\bkya baat\b|\bbaat (karun|karoon|karu|karein|kar)\b/i;

/** "What should I talk to him about?": the bedtime-questions answer. */
export function isTalkAbout(text: string): boolean {
  return TALK_ABOUT.test(text);
}

/** Which view of the progress report a parent's line asks about, for the 📈 card under Memory's reply. */
export function progressViewFor(text: string): "today" | "week" | null {
  if (/\b(week|hafte|hafta)\b/i.test(text) && /\b(how|what|was|kaisa|kaisi|kaise|kya)\b/i.test(text)) return "week";
  if (isTalkAbout(text)) return "today";
  if (/\b(learn|learnt|learned|learning|seekha|sikha|seekhi)\b/i.test(text)) return "today";
  return null;
}

/** When the brain is slow: today's lines and bedtime questions from the progress report's plain builder. */
async function talkFallback(): Promise<string> {
  const t = await getToday({ quick: true });
  const lines = (t.data.summary ?? [])
    .slice(0, 2)
    .map((l) => (/[.!?…"”]$/.test(l.trim()) ? l.trim() : `${l.trim()}.`))
    .join(" ");
  const qs = t.data.starters.slice(0, 3).map((q, i) => `${i + 1}. ${q}`);
  if (!lines || qs.length < 3) throw new Error("memory talk fallback: nothing to say");
  return `${lines}\n\nAsk him at bedtime:\n${qs.join("\n")}`;
}

/** A specific, warm answer. Throws on a brain or database error (the caller keeps the sorter's reply). */
export async function answerMemoryQuestion(question: string, sender: string): Promise<string> {
  const talk = isTalkAbout(question);
  try {
    return await answer(question, sender, talk);
  } catch (e) {
    if (!talk) throw e;
    console.warn(`[memory] talk answer fell back: ${(e as Error).message}`);
    return talkFallback().catch(() => {
      throw e;
    });
  }
}

async function answer(question: string, sender: string, talk: boolean): Promise<string> {
  const demo = await getDemoState(CHILD_ID);
  const [brain, turns, notes] = await Promise.all([getLatest(CHILD_ID, "brain"), dayTurns(CHILD_ID), dayNotes(CHILD_ID)]);
  const now = clockParts(demoNow(demo.clock_offset_ms));
  const hindi = /[ऀ-ॿ]|\b(kya|hai|hain|ne|ko|aaj|kaise|kaisa|mein|se|ki|ka|nahi|haan|kuch|bata|batao|usne|kitna)\b/i.test(question);
  const lang = hindi ? "the same mix of Hindi and English the parent used" : "English only (no Hindi sentences; a Hindi word he said may be quoted)";
  const user = `Today is ${now.dayLabel}. ${sender} asks: ${question}
Reply in ${lang}${talk ? ": the moments in at most 30 words, then the three bedtime questions." : ", at most 30 words."}

TODAY'S TURNS WITH ${child.toUpperCase()}
${turnsText(turns)}

${nani.toUpperCase()}'S NOTES TODAY
${notes.length ? notes.map((n) => `- ${n}`).join("\n") : "(none)"}

BRAIN.MD
${brain.content.trim()}`;
  const r = await brainComplete({
    messages: [
      { role: "system", content: talk ? SYSTEM_TALK : SYSTEM },
      { role: "user", content: user },
    ],
    maxTokens: talk ? 300 : 200,
    signal: AbortSignal.timeout(7_000), // past this the sorter's own reply is used (for "talk about", the report's lines)
  });
  // Unwrap only a fully quoted answer: a closing quote after "Ask him, "…?"" belongs to the answer.
  const raw = r.text.trim();
  const unquoted = /^["“][^"“”]*["”]$/.test(raw) ? raw.slice(1, -1) : raw;
  // The bedtime questions keep their own lines (the chat shows line breaks); other answers are one paragraph.
  const text = talk
    ? unquoted
        .replace(/\*\*/g, "")
        .split("\n")
        .map((l) => l.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
    : unquoted.replace(/\s*\n+\s*/g, " ");
  if (!text) throw new Error("memory answer: empty");
  return text;
}
