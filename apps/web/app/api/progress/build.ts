// The progress report's data (REFINE R7.2). Server-only. Used by GET /api/progress, the evening brief and Memory's answer.
//
// Today is built from today's turns and chat:
//   - words, letters, counting, areas, routine, tricky spots and highlights: deterministically, from the show, spell,
//     tile and count cues in turns.cues, the job and call turns, and the notes Nani's turns left (meta.kind "note").
//   - the three lines, the feelings and the starters: ONE brain call (never parallel, ~6 s timeout, plain fallback).
// Today's row in progress_days is the cache: a row younger than 60 s, or newer than today's last turn and note, is reused.
// Week, month and all time aggregate progress_days plus today.
import { z } from "zod";
import { MEMORY_TONE, turnsText, type DayTurn } from "@/lib/agents/memory";
import { brainJson } from "@/lib/brain";
import { clockParts } from "@/lib/clock";
import { CHILD_ID, config } from "@/lib/config";
import { getLatest } from "@/lib/files";
import { getSection } from "@/lib/files-pure";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Cue, MessageMeta, ProgressArea, ProgressDayData, ProgressFeeling, TurnKind } from "@/lib/types";
import type { ReportData, ReportDay, ReportMoment, ReportView, ReportWord } from "@/components/report/types";

const CHILD = config.childName;
const NANI = config.grandmaName;
const TTL_MS = 60_000;
const BRAIN_TIMEOUT_MS = 6_500; // Kimi writes these lines in ~4 to 6 s; past this the plain lines stand
const RETRY_AFTER_FAIL_MS = 30_000; // a stalled brain is not asked again on this instance for 30 s
const AREAS: ProgressArea[] = ["language", "numbers", "feelings", "culture"];
const FEELINGS: ProgressFeeling[] = ["happy", "excited", "calm", "tired", "upset", "scared", "sad"];

// ---------- loading ----------

interface TurnRow {
  kind: TurnKind;
  child_text: string | null;
  nani_text: string | null;
  cues: Cue[] | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}
interface MsgRow {
  sender: string;
  text: string;
  meta: MessageMeta | null;
  created_at: string;
}
interface Row {
  day: string;
  data: ProgressDayData;
  updated_at?: string;
}

/** Real start of today in India (turns are stamped with real time, like lib/agents/memory.ts). */
function indiaDayStart(now = new Date()): Date {
  return new Date(now.getTime() - clockParts(now).minutes * 60_000 - (now.getTime() % 60_000));
}

async function loadRows(): Promise<Row[]> {
  const { data, error } = await supabaseAdmin()
    .from("progress_days")
    .select("day, data, updated_at")
    .eq("child_id", CHILD_ID)
    .order("day", { ascending: true });
  if (error) throw new Error(`progress_days: ${error.message}`);
  return (data ?? []) as Row[];
}

async function loadDay(): Promise<{ turns: TurnRow[]; msgs: MsgRow[]; planner: string; brain: string }> {
  const since = indiaDayStart().toISOString();
  const sb = supabaseAdmin();
  const [t, m, planner, brain] = await Promise.all([
    sb
      .from("turns")
      .select("kind, child_text, nani_text, cues, meta, created_at")
      .eq("child_id", CHILD_ID)
      .gte("created_at", since)
      .order("id", { ascending: true })
      .limit(300),
    sb
      .from("messages")
      .select("sender, text, meta, created_at")
      .eq("child_id", CHILD_ID)
      .eq("sender_kind", "bot")
      .gte("created_at", since)
      .order("id", { ascending: true })
      .limit(300),
    getLatest(CHILD_ID, "planner").then((f) => f.content).catch(() => ""),
    getLatest(CHILD_ID, "brain").then((f) => f.content).catch(() => ""),
  ]);
  if (t.error) throw new Error(`turns: ${t.error.message}`);
  if (m.error) throw new Error(`messages: ${m.error.message}`);
  return { turns: (t.data ?? []) as TurnRow[], msgs: (m.data ?? []) as MsgRow[], planner, brain };
}

// ---------- today's facts (deterministic) ----------

const NUMBER_WORDS = /^(red|blue|yellow|green|orange|pink|purple|black|white|brown|circle|square|triangle|star shape|big|small|more|less|full|empty|one|two|three|four|five|six|seven|eight|nine|ten)$/i;
const FEELING_WORDS = /^(thank you|please|sorry|share|happy|sad|angry|scared|kind|hug|clean hands|water)$/i;
const CULTURE_WORDS = /^(diya|lamp|rangoli|diwali|holi|rakhi|song|dance|drum|dhol|sweet|ladoo|festival|kite)$/i;
const MANNERS = /\b(thank\s*you|thanks|please|sorry|shukriya|dhanyavaad|share|baant)/i;
const WATER = /paani|pani|water|piyo|piya/i;

function areaOf(word: string): ProgressArea {
  if (NUMBER_WORDS.test(word)) return "numbers";
  if (FEELING_WORDS.test(word)) return "feelings";
  if (CULTURE_WORDS.test(word)) return "culture";
  return "language";
}

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);
const hhmm = (iso: string) => clockParts(new Date(iso)).hhmm;

/** His words as heard, short enough for a quote. */
function quoteOf(text: string | null): string | undefined {
  const t = (text ?? "").replace(/\s+/g, " ").trim().replace(/^["“'”]+|["“'”]+$/g, "");
  if (!t) return undefined;
  return t.length > 70 ? `${t.slice(0, 67).trimEnd()}…` : t;
}

/** Names are not new words: the child, Nani, the parents and the best friend from brain.md. */
function namesOf(brain: string): Set<string> {
  const names = [CHILD, NANI, ...config.parents, "Mumma", "Papa"];
  const friend = brain.match(/Best friend:\s*([A-Z][a-z]+)/);
  if (friend) names.push(friend[1]);
  return new Set(names.map((n) => n.toLowerCase()));
}

function plannerLetter(planner: string): string | null {
  const m = getSection(planner, "## Today").match(/Letter:\s*([A-Za-z])\b/);
  return m ? m[1].toUpperCase() : null;
}

const TIPS: Record<string, string> = {
  MN: "Draw M on his back with a finger: two hills for M, one hill for N.",
  NM: "Draw M on his back with a finger: two hills for M, one hill for N.",
  BD: "Close your lips and pop them open: b-b-ball. Ask him to copy you.",
  DB: "Close your lips and pop them open: b-b-ball. Ask him to copy you.",
  PB: "Hold a hand in front of your mouth: P puffs air, B doesn't.",
};

interface Facts {
  play: boolean;
  lastActivity: string | null;
  letter: string | null;
  base: Omit<ProgressDayData, "summary" | "moods" | "starters">;
  talk: TurnRow[];
  notes: MsgRow[];
}

function factsOf(day: { turns: TurnRow[]; msgs: MsgRow[]; planner: string; brain: string }, learntBefore: Set<string>): Facts {
  const talk = day.turns.filter((t) => t.kind === "talk" && (t.child_text || t.nani_text));
  const notes = day.msgs.filter((m) => m.meta?.kind === "note");
  const names = namesOf(day.brain);
  const words: ProgressDayData["words"] = [];
  const seen = new Set<string>();
  const areas = Object.fromEntries(AREAS.map((a) => [a, 0])) as Record<ProgressArea, number>;
  const working: string[] = [];
  const addWorking = (l: string | undefined) => {
    const u = (l ?? "").toUpperCase();
    if (/^[A-Z]$/.test(u) && !learntBefore.has(u) && !working.includes(u)) working.push(u);
  };
  const letter = plannerLetter(day.planner);
  addWorking(letter ?? undefined);
  let upTo = 0;
  const tricky: ProgressDayData["tricky"] = [];
  const rightTiles: { letter: string; word: string; t: TurnRow }[] = [];
  let lastSpell: Extract<Cue, { type: "spell" }> | null = null;
  let songs = 0;

  const addWord = (word: string, hi: string | undefined, emoji: string, t: TurnRow) => {
    const en = word.trim();
    const k = en.toLowerCase();
    if (!en || seen.has(k) || names.has(k) || en.length > 24) return;
    seen.add(k);
    const area = areaOf(en);
    // His words count as his quote only when he said the word (in English or Hindi).
    const said = (t.child_text ?? "").toLowerCase();
    const q = said.includes(k) || (hi && said.includes(hi.toLowerCase())) ? quoteOf(t.child_text) : undefined;
    words.push({ en, ...(hi ? { hi } : {}), emoji, area, ...(q ? { quote: q } : {}), firstSaid: t.created_at });
    areas[area] += 1;
  };

  for (const t of talk) {
    const cues = Array.isArray(t.cues) ? t.cues : [];
    const shown = cues.find((c): c is Extract<Cue, { type: "show" }> => c.type === "show");
    for (const c of cues) {
      switch (c.type) {
        case "show":
          addWord(c.word, c.hindi, c.emoji, t);
          break;
        case "spell": {
          lastSpell = c;
          addWorking(c.word[c.gap - 1]);
          const sameAsShown = shown && shown.word.toLowerCase() === c.word.toLowerCase();
          if (!sameAsShown) addWord(cap(c.word), undefined, shown?.emoji ?? "🔤", t);
          areas.language += 1;
          break;
        }
        case "tile": {
          addWorking(c.letter);
          areas.language += 1;
          const target = lastSpell ? lastSpell.word[lastSpell.gap - 1]?.toUpperCase() : undefined;
          const w = lastSpell ? cap(lastSpell.word) : "";
          if (c.result === "right") rightTiles.push({ letter: c.letter.toUpperCase(), word: w, t });
          else if (target && target !== c.letter.toUpperCase() && !tricky.some((x) => x.what.startsWith(`${target} `))) {
            const picked = c.letter.toUpperCase();
            tricky.push({
              what: `${target} or ${picked}? He picked ${picked} for ${w}`,
              tip: TIPS[target + picked] ?? `Find two things at home tonight that start with ${target}, and say the ${target} sound together.`,
            });
          }
          break;
        }
        case "count":
          upTo = Math.max(upTo, Math.min(10, c.b !== undefined ? c.a + c.b : c.a));
          areas.numbers += 1;
          break;
        case "song":
          songs += 1;
          areas.culture += 1;
          break;
        case "sound":
          areas.language += 1;
          break;
        case "call":
          areas.feelings += 1;
          break;
      }
    }
    if (MANNERS.test(t.child_text ?? "")) areas.feelings += 1;
  }

  const jobs = day.turns.filter((t) => t.kind === "job");
  const jobText = (t: TurnRow) => String(t.meta?.text ?? "");
  const asked = jobs.filter((t) => t.meta?.action === "say" && WATER.test(jobText(t))).length;
  const done = notes.filter((m) => m.sender === "routine" && m.meta?.reason === "reminder" && /💧/.test(m.text)).length;
  const calls = new Set(day.msgs.filter((m) => m.meta?.kind === "call" && m.meta.callId).map((m) => String(m.meta!.callId))).size;
  songs += jobs.filter((t) => t.meta?.action === "song").length + day.turns.filter((t) => t.kind === "song").length;
  const stories = songs + jobs.filter((t) => /story|kahani/i.test(jobText(t))).length;
  areas.feelings += done + calls;

  const highlights: ProgressDayData["highlights"] = [];
  for (const m of day.msgs) {
    const isMoment = m.meta?.kind === "note" && (m.meta.reason === "moment" || m.meta.reason === "followed");
    const isSong = m.meta?.kind === "event" && m.meta.event === "song";
    if (!isMoment && !isSong) continue;
    const q = m.text.match(/["“]([^"“”]{2,60})["”]/);
    highlights.push({ text: m.text.replace(/\s+/g, " ").trim(), ...(q ? { quote: q[1] } : {}) });
  }
  if (!highlights.length && rightTiles.length) {
    const r = rightTiles[rightTiles.length - 1];
    const q = quoteOf(r.t.child_text);
    highlights.push({ text: `Got ${r.letter} right${r.word ? ` in ${r.word}` : ""} on the wall`, ...(q && q.length > 3 ? { quote: q } : {}) });
  }

  const stamps = [...day.turns.map((t) => t.created_at), ...notes.map((m) => m.created_at)].sort();
  return {
    play: talk.length > 0,
    lastActivity: stamps.length ? stamps[stamps.length - 1] : null,
    letter: working[0] ?? null,
    talk,
    notes,
    base: {
      words,
      letters: { learnt: [], working },
      counting: { upTo },
      areas,
      tricky: tricky.slice(0, 3),
      routine: { water: { asked, done: Math.min(done, Math.max(asked, done)) }, calls, stories },
      highlights: highlights.slice(0, 4),
    },
  };
}

// ---------- today's three lines, feelings and starters ----------

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const letterWordOf = (letter: string | null, words: { en: string }[]) => (letter ? words.find((w) => w.en.toUpperCase().startsWith(letter))?.en : undefined);

type Lines = Pick<ProgressDayData, "summary" | "moods" | "starters">;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Said 'Thank you, Nani!' all by himself": the best moment of a past day. */
function lastMoment(r: Row): string {
  return (r.data.highlights?.[0]?.text ?? r.data.summary?.[0] ?? `A day with ${NANI}`).replace(/\s*[.!]+$/, "");
}

/** The quiet-day lines: honest, no invented activity. */
function quietLines(f: Facts, rows: Row[]): Lines {
  const last = [...rows].reverse().find((r) => r.data.summary?.length);
  return {
    summary: [
      `No playtime with ${NANI} yet today.`,
      f.letter ? `${f.letter} is waiting for him whenever he's ready.` : `${NANI} is ready whenever he is.`,
      last ? `Last played on ${+last.day.slice(8)} ${MONTHS[+last.day.slice(5, 7) - 1]}. ${lastMoment(last)}.` : "That's okay: some days are quiet.",
    ],
    moods: [],
    // the last play day's questions, minus any that say "today"
    starters: [...(last?.data.starters ?? []).filter((s) => !/\b(today|aaj)\b/i.test(s)), `What would you like to play with ${NANI} tomorrow?`].slice(0, 3),
  };
}

/** Plain lines built from the facts, when the brain is slow or down. */
function fallbackLines(f: Facts): Lines {
  const { words, counting, highlights } = f.base;
  const lw = letterWordOf(f.letter, words);
  const firstQuote = f.talk.map((t) => quoteOf(t.child_text)).find(Boolean);
  const summary: string[] = [];
  if (words.length) {
    const named = words.slice(0, 3).map((w) => `${w.en} ${w.emoji}`);
    summary.push(`Met ${list(named)}${words.length > 3 ? `, and ${words.length - 3} more` : ""}.`);
  } else summary.push(`Played and chatted with ${NANI}.`);
  if (f.letter) summary.push(`Worked on ${f.letter}${lw ? ` for ${lw}` : ""} on the wall.`);
  if (counting.upTo) summary.push(`Counted to ${counting.upTo} with ${NANI}.`);
  if (summary.length < 3 && highlights[0]) summary.push(highlights[0].text.replace(/\s*[.!]?$/, "."));
  if (summary.length < 3 && firstQuote) summary.push(`He said: "${firstQuote}"`);
  const moods: ProgressDayData["moods"] = [];
  for (const t of f.talk) {
    if (moods.length >= 2) break;
    if ((t.cues ?? []).some((c) => c.type === "cheer")) moods.push({ time: hhmm(t.created_at), feeling: "excited", what: `Cheered on the wall: "${quoteOf(t.child_text) ?? "Yay!"}"` });
  }
  if (!moods.length && f.talk[0]) moods.push({ time: hhmm(f.talk[0].created_at), feeling: "happy", what: `Came to play with ${NANI}` });
  const starters: string[] = [];
  const w0 = words.find((w) => w.hi) ?? words[0];
  if (w0) starters.push(w0.hi ? `What is "${w0.hi}" in English?` : `Can you tell me about the ${w0.en.toLowerCase()}?`);
  if (f.letter) starters.push(`What starts with ${f.letter}? Can you find one at home?`);
  if (counting.upTo) starters.push(`Can you count to ${counting.upTo} for me, like you did with ${NANI}?`);
  if (starters.length < 3) starters.push(`What was the best bit of playing with ${NANI} today?`);
  if (starters.length < 3) starters.push(`What would you like to show ${NANI} tomorrow?`);
  return { summary: summary.slice(0, 3), moods, starters: starters.slice(0, 3) };
}

const strings = (n: number) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []),
    z.array(z.string().trim().min(1)).min(1).transform((a) => a.slice(0, n)),
  );
const LinesSchema = z.object({
  summary: strings(3),
  starters: strings(3),
  moods: z
    .array(
      z.object({
        time: z.string().optional(),
        feeling: z.string(),
        what: z.string().trim().min(1),
        helped: z.string().trim().optional().nullable(),
      }),
    )
    .catch([]),
});

const SYSTEM = `You are Memory, the member of the family group chat who keeps ${CHILD}'s (age ${config.age}) progress report, from his day with ${NANI}, his AI grandma in his soft toy. The report follows the spirit of a holistic progress card: stories of growth, never scores.

${MEMORY_TONE}

Reply with ONE JSON object only:
{"summary":["…","…","…"],"moods":[{"time":"HH:MM","feeling":"happy","what":"…","helped":"…"}],"starters":["…","…","…"]}
- summary: exactly 3 short lines about today, each under 12 words, taken only from today's turns and notes. Name real moments: a word, a letter, what he counted, his own words in quotes.
- moods: 1 to 3 moments where his feeling clearly showed in the turns. time is that turn's time. feeling is one of: happy, excited, calm, tired, upset, scared, sad. what: under 12 words. helped: only for tired, upset, scared or sad, what helped him (under 14 words), if the turns show it; otherwise leave it out. Never guess a feeling the turns don't show.
- starters: exactly 3 bedtime questions a parent can ask ${CHILD}, in simple English (a Hindi word he said is fine), each under 12 words and tied to a different real moment from today.
- Plain English with a little Hindi flavour. No emoji in starters.`;

async function brainLines(f: Facts, day: { brain: string }): Promise<Lines> {
  const dayTurns: DayTurn[] = f.talk.slice(-40).map((t) => ({ kind: t.kind, child_text: t.child_text, nani_text: t.nani_text, cues: t.cues ?? [], created_at: t.created_at }));
  const facts = [
    f.base.words.length ? `Words on the wall: ${f.base.words.map((w) => w.en).join(", ")}` : "",
    f.letter ? `Letter he is working on: ${f.letter}` : "",
    f.base.counting.upTo ? `Counted up to: ${f.base.counting.upTo}` : "",
  ].filter(Boolean);
  const user = `TODAY'S TURNS WITH ${CHILD.toUpperCase()}
${turnsText(dayTurns)}

${NANI.toUpperCase()}'S NOTES TODAY
${f.notes.length ? f.notes.map((n) => `- ${n.text}`).join("\n") : "(none)"}

FACTS
${facts.join("\n") || "(none)"}

ABOUT HIM (brain.md, for names only; never report past days as today)
${getSection(day.brain, `## About ${CHILD}`).trim() || "(none)"}

JSON only.`;
  const raw = await brainJson({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    maxTokens: 420,
    label: "progress",
    signal: AbortSignal.timeout(BRAIN_TIMEOUT_MS),
  });
  const r = LinesSchema.parse(raw);
  const times = f.talk.map((t) => hhmm(t.created_at));
  const moods = r.moods
    .filter((m) => (FEELINGS as string[]).includes(m.feeling))
    .slice(0, 3)
    .map((m) => ({
      time: m.time && /^\d\d:\d\d$/.test(m.time) ? m.time : (times[0] ?? "12:00"),
      feeling: m.feeling as ProgressFeeling,
      what: m.what,
      ...(m.helped && !["happy", "excited", "calm"].includes(m.feeling) ? { helped: m.helped } : {}),
    }));
  const fb = fallbackLines(f);
  const pad = (xs: string[], extra: string[]) => [...xs, ...extra.filter((x) => !xs.includes(x))].slice(0, 3);
  return { summary: pad(r.summary, fb.summary ?? []), moods, starters: pad(r.starters, fb.starters) };
}

// ---------- today, with the cache ----------

export interface TodayResult {
  day: string;
  data: ProgressDayData;
  play: boolean;
  pending: boolean; // the lines are a placeholder: a full request will write them
  source: "quiet" | "cache" | "brain" | "fallback";
}

let inflight: Promise<Lines | null> | null = null;
let lastFail = 0;

/**
 * Today's progress. quick: never calls the brain (uses today's stored lines, or the plain fallback, and says pending).
 * Otherwise: reuses fresh stored lines, or makes the one brain call (single-flight per instance) and upserts the row.
 */
export async function getToday(opts: { quick?: boolean; rows?: Row[] } = {}): Promise<TodayResult> {
  const dayKey = clockParts(new Date()).dateKey;
  const [rows, day] = await Promise.all([opts.rows ? Promise.resolve(opts.rows) : loadRows(), loadDay()]);
  const learntBefore = new Set(rows.filter((r) => r.day < dayKey).flatMap((r) => r.data.letters?.learnt ?? []));
  const f = factsOf(day, learntBefore);
  const stored = rows.find((r) => r.day === dayKey) ?? null;
  const assemble = (l: Lines): ProgressDayData => ({ ...f.base, ...l });

  if (!f.play) return { day: dayKey, data: assemble(quietLines(f, rows.filter((r) => r.day < dayKey))), play: false, pending: false, source: "quiet" };

  const storedAt = stored?.updated_at ? Date.parse(stored.updated_at) : 0;
  const fresh = !!stored?.data.summary?.length && (Date.now() - storedAt < TTL_MS || (!!f.lastActivity && storedAt >= Date.parse(f.lastActivity)));
  const storedLines = (): Lines | null =>
    stored?.data.summary?.length ? { summary: stored.data.summary, moods: stored.data.moods ?? [], starters: stored.data.starters ?? [] } : null;
  if (fresh) return { day: dayKey, data: assemble(storedLines()!), play: true, pending: false, source: "cache" };

  const noBrain = process.env.PROGRESS_NO_BRAIN === "1";
  if (opts.quick || noBrain || Date.now() - lastFail < RETRY_AFTER_FAIL_MS) {
    // quick: a full request will write the lines. After a recent failure, the plain lines stand for now.
    return { day: dayKey, data: assemble(storedLines() ?? fallbackLines(f)), play: true, pending: !!opts.quick && !noBrain, source: "fallback" };
  }

  if (!inflight) {
    const t0 = Date.now();
    inflight = brainLines(f, day)
      .then((l) => {
        console.log(`[progress] brain ${Date.now() - t0} ms`);
        return l;
      })
      .catch((e) => {
        lastFail = Date.now();
        console.warn(`[progress] brain failed after ${Date.now() - t0} ms: ${(e as Error).message.slice(0, 200)}`);
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  const lines = await inflight;
  const data = assemble(lines ?? fallbackLines(f));
  // A fallback row keeps no summary, so the next open asks the brain again.
  const row = lines ? data : { ...data, summary: undefined };
  const { error } = await supabaseAdmin()
    .from("progress_days")
    .upsert({ child_id: CHILD_ID, day: dayKey, data: row, updated_at: new Date().toISOString() });
  if (error) console.warn(`[progress] upsert: ${error.message}`);
  return { day: dayKey, data, play: true, pending: false, source: lines ? "brain" : "fallback" };
}

// ---------- the report for a period ----------

const DAY_MS = 86_400_000;
const toMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY_MS);

function periodOf(view: ReportView, today: string, first: string): { from: string; to: string } {
  if (view === "today") return { from: today, to: today };
  if (view === "week") return { from: addDays(today, -6), to: today };
  if (view === "month") return { from: addDays(today, -29), to: today };
  return { from: first < today ? first : today, to: today };
}

/** The whole report for one view. `asOf` (dev only) pretends today is that date. */
export async function buildReport(view: ReportView, opts: { quick?: boolean; asOf?: string } = {}): Promise<ReportData> {
  const rows = await loadRows();
  const t = await getToday({ quick: opts.quick, rows });
  const today = opts.asOf ?? t.day;
  const past = rows.filter((r) => r.day < today && r.day !== t.day);
  const all: Row[] = [...past, ...(t.play ? [{ day: today, data: t.data }] : [])];
  const first = all[0]?.day ?? today;
  const { from, to } = periodOf(view, today, first);
  const inP = all.filter((r) => r.day >= from && r.day <= to);

  // words: the earliest day wins for "first said" and his words then
  const firstOf = new Map<string, { day: string; w: ProgressDayData["words"][number] }>();
  for (const r of all) for (const w of r.data.words ?? []) if (!firstOf.has(w.en.toLowerCase())) firstOf.set(w.en.toLowerCase(), { day: r.day, w });
  const words: ReportWord[] = [];
  const seen = new Set<string>();
  for (const r of inP) {
    for (const w of r.data.words ?? []) {
      const k = w.en.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const f = firstOf.get(k)!;
      words.push({ ...f.w, hi: f.w.hi ?? w.hi, isNew: f.day >= from });
    }
  }

  // letters: learnt so far, made his in this period, and the one he's on now
  const learnt = new Set<string>();
  const fresh = new Set<string>();
  for (const r of all) {
    for (const l of r.data.letters?.learnt ?? []) {
      learnt.add(l);
      if (r.day >= from) fresh.add(l);
    }
  }
  let current: string | null = null;
  for (const r of [...all].reverse()) {
    current = (r.data.letters?.working ?? []).find((l) => !learnt.has(l)) ?? null;
    if (current) break;
  }
  // A quiet day: the letter in today's plan is the one he's on.
  if (!current) current = t.data.letters.working.find((l) => !learnt.has(l)) ?? null;

  const areas = Object.fromEntries(AREAS.map((a) => [a, 0])) as Record<ProgressArea, number>;
  const routine = { water: { asked: 0, done: 0 }, calls: 0, stories: 0 };
  const moods: ReportMoment[] = [];
  const highlights: ReportData["highlights"] = [];
  for (const r of inP) {
    for (const a of AREAS) areas[a] += r.data.areas?.[a] ?? 0;
    routine.water.asked += r.data.routine?.water.asked ?? 0;
    routine.water.done += r.data.routine?.water.done ?? 0;
    routine.calls += r.data.routine?.calls ?? 0;
    routine.stories += r.data.routine?.stories ?? 0;
    for (const m of r.data.moods ?? []) moods.push({ day: r.day, ...m });
    for (const h of r.data.highlights ?? []) highlights.push({ day: r.day, ...h });
  }
  highlights.reverse();

  // tricky spots: what he's on now (the last two weeks, newest first), whatever the period
  const tricky: ReportData["tricky"] = [];
  const recent = all.filter((r) => r.day >= addDays(to, -13) && r.day <= to);
  for (const r of [...recent].reverse()) {
    for (const x of r.data.tricky ?? []) if (tricky.length < 3 && !tricky.some((y) => y.what === x.what)) tricky.push(x);
  }

  const counting = {
    upTo: Math.max(0, ...all.map((r) => Math.min(10, r.data.counting?.upTo ?? 0))),
    inPeriod: Math.max(0, ...inP.map((r) => Math.min(10, r.data.counting?.upTo ?? 0))),
  };

  // the calendar: every day from the first to today
  const byDay = new Map(all.map((r) => [r.day, r]));
  const days: ReportDay[] = [];
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const r = byDay.get(d);
    const newWords = r ? (r.data.words ?? []).filter((w) => firstOf.get(w.en.toLowerCase())?.day === d).length : 0;
    days.push({ day: d, played: !!r, newWords, ...(r?.data.summary?.length ? { summary: r.data.summary } : {}), ...(d === today ? { live: true } : {}) });
  }

  const playDays = inP.length;
  const quiet = playDays === 0;
  let summary: string[];
  let starters: string[];
  if (view === "today") {
    summary = t.data.summary ?? [];
    starters = t.data.starters;
  } else {
    summary = periodLines(view, { words, fresh: [...fresh].sort(), current, highlights, counting, playDays });
    // one starter from each of the latest play days first, then the rest; a month or all time leaves today's to the Today view
    const src = view === "week" ? inP : inP.filter((r) => r.day !== today);
    const pool: string[] = [];
    for (const r of [...src].reverse()) for (const s of r.data.starters ?? []) if (!pool.includes(s)) pool.push(s);
    const firsts = [...src].reverse().map((r) => r.data.starters?.[0]).filter((s): s is string => !!s);
    starters = [...new Set([...firsts, ...pool])].slice(0, 3);
    if (!starters.length) starters = t.data.starters;
  }

  return {
    view,
    childName: CHILD,
    grandmaName: NANI,
    today,
    from,
    to,
    quiet,
    pending: t.pending && from <= today,
    summary,
    starters,
    words,
    letters: { learnt: [...learnt].sort(), fresh: [...fresh].sort(), current },
    counting,
    areas,
    days,
    moods,
    tricky,
    routine,
    highlights: highlights.slice(0, 6),
    playDays,
  };
}

const PERIOD_NAME: Record<ReportView, string> = { today: "today", week: "this week", month: "this month", all: "so far" };

/** Three plain lines for a week, a month or all time (no brain call). */
function periodLines(
  view: ReportView,
  p: { words: ReportWord[]; fresh: string[]; current: string | null; highlights: ReportData["highlights"]; counting: { upTo: number }; playDays: number },
): string[] {
  if (!p.playDays) return [`No playtime with ${NANI} ${PERIOD_NAME[view]}.`, p.current ? `${p.current} is waiting for him whenever he's ready.` : `${NANI} is ready whenever he is.`, "Some weeks are quiet, and that's okay."];
  const lines: string[] = [];
  if (p.fresh.length) {
    const shown = p.fresh.length > 6 ? `${p.fresh[0]} to ${p.fresh[p.fresh.length - 1]}` : list(p.fresh);
    lines.push(`${shown} became his${p.current ? `, and ${p.current} is next` : ""}.`);
  } else if (p.current) lines.push(`Working on the letter ${p.current} now.`);
  // up to three new words, from different days, newest first
  const fresh: ReportWord[] = [];
  for (const w of [...p.words].reverse()) {
    if (w.isNew && fresh.length < 3 && !fresh.some((x) => x.firstSaid?.slice(0, 10) === w.firstSaid?.slice(0, 10))) fresh.push(w);
  }
  if (fresh.length) {
    const named = fresh.map((w) => `${w.en} ${w.emoji}`);
    lines.push(`New words, like ${list(named)}.`);
  }
  const best = p.highlights.find((h) => h.quote) ?? p.highlights[0];
  if (best) lines.push(`${best.text.replace(/\s*[.!]?$/, "")}.`);
  if (lines.length < 3 && p.counting.upTo) lines.push(`Counts to ${p.counting.upTo} on his own.`);
  if (lines.length < 3) lines.push(`Played with ${NANI} on ${p.playDays} day${p.playDays > 1 ? "s" : ""}.`);
  return lines.slice(0, 3);
}
