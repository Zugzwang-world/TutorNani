// Outcome notes from Nani's turns (PLAN.md B8) and the song event. Server-only.
// Runs after the turn's response has closed (next/server `after`), never on the live path.
//
// At most one note per turn, decided here on the server (Nani's own [[note]] markers are only hints), in order:
//  (b) reminder: the first talk turn after a reminder: Routine quotes Aarav. Deterministic, no brain call.
//  (a) followed: the first turn that puts a parent's change into practice: that change's agent says so.
//      One small JSON brain call, only while an unreported change is pending. Each change is reported once
//      (meta.forVersions), so a later turn never repeats it.
//  (c) moment: Nani's own [[note nani|memory: …]] for a big moment, at most one per 5 talk turns.
// Song: a turn with a [[song]] cue posts Nani's event "Sang 'Ek Do Teen' with Aarav 🎵" (meta kind "event").
import { audioById } from "../audio";
import { brainJson } from "../brain";
import { clockParts } from "../clock";
import { config } from "../config";
import { post } from "../messages";
import { supabaseAdmin } from "../supabase/server";
import { BOTS, type BotKey, type Cue, type FileName, type MessageMeta, type NaniEvent, type Note } from "../types";
import { groupChanges, isReported, loadChangeRows, loadReported, routineOnly, seenBy, type ChangeGroup } from "./changes";

const CHILD = config.childName;
const NANI = config.grandmaName;

const MOMENT_EVERY = 5; // talk turns between two big-moment notes
const REMINDER_ANSWER_MS = 15 * 60_000; // a turn this soon after the reminder (real time) is his answer
const PENDING_MAX = 3; // newest unreported changes the judge looks at
const PENDING_MAX_AGE_MS = 3 * 3600_000;
const JUDGE_TIMEOUT_MS = 12_000; // after the response, so a slow brain only delays the note

export interface TurnOutcomeInput {
  child: string;
  turnId: number | null;
  childText: string;
  reply: string; // Nani's raw reply, markers included
  cues: Cue[];
  naniNotes: Note[]; // her own [[note …]] markers: hints only
  lastEvent: NaniEvent | null;
  lastEventFresh: boolean; // no talk turn between that event and this turn
  clockOffsetMs: number;
  fileVersions: Record<FileName, number>; // the versions this turn's prompt used
}

/** Posts the song event and at most one outcome note. Never throws; logs one line. */
export async function postTurnOutcomes(i: TurnOutcomeInput): Promise<void> {
  const t0 = Date.now();
  const log: Record<string, unknown> = { turnId: i.turnId };
  const song = i.cues.some((c) => c.type === "song") ? postSong(i).then(() => (log.song = true)).catch((e) => (log.songError = msg(e))) : null;
  try {
    await decideNote(i, log);
  } catch (e) {
    log.error = msg(e);
  }
  if (song) await song.catch((e) => (log.songError = msg(e)));
  log.ms = Date.now() - t0;
  console.log(`[turn-note] ${JSON.stringify(log)}`);
}

async function decideNote(i: TurnOutcomeInput, log: Record<string, unknown>): Promise<void> {
  const [reported, rows] = await Promise.all([loadReported(i.child), loadChangeRows(i.child)]);

  // (b) Aarav answers a reminder.
  const ev = i.lastEvent;
  if (ev?.kind === "reminder" && i.lastEventFresh && Date.now() - Date.parse(ev.at) < REMINDER_ANSWER_MS) {
    const key = `${ev.jobKey ?? ev.text}@${ev.at}`;
    if (!reported.events.has(key)) {
      const at = await reminderTime(i.child, ev, i.clockOffsetMs);
      const emoji = /paani|pani|water|piyo|piya/i.test(ev.text) ? "💧" : "🔔";
      const text = `Reminded ${CHILD} at ${at}. He said "${quote(i.childText)}" ${emoji}`;
      await postNote(i, "routine", text, { reason: "reminder", forEvent: key });
      log.note = { reason: "reminder", bot: "routine", text };
      return;
    }
  }

  // (a) The first turn that puts a parent's change into practice.
  const now = Date.now();
  const pending = groupChanges(seenBy(rows, i.fileVersions))
    .filter((g) => !routineOnly(g) && !isReported(g, reported) && now - Date.parse(g.at) < PENDING_MAX_AGE_MS)
    .slice(-PENDING_MAX);
  log.pending = pending.length;
  if (pending.length) {
    const pick = await judge(i, pending, log);
    if (pick) {
      // Two quick turns can both judge the same change: check again right before posting.
      if (isReported(pick.group, await loadReported(i.child))) {
        log.skipped = "already reported";
        return;
      }
      const bot = pick.group.bots.find((b) => b !== "routine") ?? "nani";
      await postNote(i, bot, pick.text, { reason: "followed", forVersions: pick.group.versions });
      log.note = { reason: "followed", bot, text: pick.text, forVersions: pick.group.versions };
      return;
    }
  }

  // (c) A big moment, in Nani's own words, at most one per MOMENT_EVERY talk turns. Not on a song turn
  // (the song event already tells the parents).
  if (i.cues.some((c) => c.type === "song")) return;
  const m = i.naniNotes.find((n) => n.bot === "nani" || n.bot === "memory");
  if (!m) return;
  const text = clean(m.text);
  if (!text) return;
  if (!(await momentAllowed(i.child, reported.lastMomentAt))) {
    log.skipped = "moment too soon";
    return;
  }
  await postNote(i, m.bot, text, { reason: "moment" });
  log.note = { reason: "moment", bot: m.bot, text };
}

// ---------- (a) the judge ----------

const JUDGE_SYSTEM = `You watch one turn of ${NANI}, an AI grandma inside a soft toy, playing with ${CHILD} (age ${config.age}). The parents changed something in the family chat (listed below). Decide whether THIS turn is where ${NANI} clearly put one of those changes into practice with ${CHILD}.

Counts: the change visibly shaped what ${NANI} said or showed in this turn. For example:
- "count in Hindi and English both": she counted saying both names ("ek, one, do, two") or used a [[count … both]] marker.
- "bringing mangoes tonight": she played with mangoes (showed, spelled, counted or talked about mangoes).
- "speak more Hindi": this reply is clearly more Hindi than English.
Does not count: she talked about something else, or the topic came up only by chance.

If one counts, write the note posted in the parents' chat by the FIRST agent named in "handled by", in that agent's voice: House rules is warm and firm, Lessons a playful teacher, Memory a doting family historian. One casual line, at most 16 words, at most one emoji, in the language the parent used for that change (English, Hindi or a mix).
Name the real moment from THIS turn with one concrete detail: what was counted and how many, the word, or ${CHILD}'s own words in quotes. Use only what this turn shows; never invent a detail or a contrast. Like "Counting both ways: ${CHILD} just went ek-one, do-two, teen-three 🔢" or "First mango round done: he said 'M se mango!' 🥭 The surprise is still safe." Don't open with "Done", "Got it" or "Noted". Never mention files, versions or system words.

Reply with JSON only: {"change": <its number, or null>, "text": "<the note, or empty>"}`;

async function judge(
  i: TurnOutcomeInput,
  pending: ChangeGroup[],
  log: Record<string, unknown>,
): Promise<{ group: ChangeGroup; text: string } | null> {
  const t = Date.now();
  const list = pending
    .map((g, k) => `${k + 1}. ${g.sender}: "${g.words}" (handled by ${g.bots.filter((b) => b !== "routine").map((b) => BOTS[b].name).join(" and ")})`)
    .join("\n");
  const said = i.reply.replace(/\[\[note[^\]]*\]\]/gi, "").replace(/\s+/g, " ").trim();
  const hint = i.naniNotes.length ? i.naniNotes.map((n) => `${n.bot}: ${n.text}`).join(" / ") : "none";
  const user = `PARENT CHANGES NOT YET SEEN IN PLAY
${list}

THIS TURN
${CHILD} said: "${i.childText}"
${NANI} said (markers show what went on the wall): "${said}"
${NANI}'s own note (a hint, may be wrong): ${hint}`;
  try {
    const r = await brainJson<{ change?: unknown; text?: unknown }>({
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: user },
      ],
      maxTokens: 120,
      signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
    });
    log.judgeMs = Date.now() - t;
    const k = Number(r?.change);
    const text = typeof r?.text === "string" ? clean(r.text) : "";
    log.judge = Number.isInteger(k) && k >= 1 && k <= pending.length ? k : null;
    if (!log.judge || !text) return null;
    return { group: pending[k - 1], text };
  } catch (e) {
    log.judgeMs = Date.now() - t;
    log.judgeError = msg(e);
    // Fallback: Nani's own marker, when it names the agent of exactly one pending change.
    const hits = pending.filter((g) => i.naniNotes.some((n) => n.bot !== "routine" && g.bots.includes(n.bot)));
    if (hits.length !== 1) return null;
    const n = i.naniNotes.find((x) => hits[0].bots.includes(x.bot))!;
    const text = clean(n.text);
    return text ? { group: hits[0], text } : null;
  }
}

// ---------- helpers ----------

async function postNote(i: TurnOutcomeInput, bot: BotKey, text: string, meta: MessageMeta): Promise<void> {
  await post(i.child, bot, "bot", text, { kind: "note", ...meta, ...(i.turnId ? { turnId: i.turnId } : {}) });
}

async function postSong(i: TurnOutcomeInput): Promise<void> {
  const title = (audioById("song")?.text ?? "").split(",")[0].trim();
  const text = title ? `Sang '${title}' with ${CHILD} 🎵` : `Sang a song with ${CHILD} 🎵`;
  await post(i.child, "nani", "bot", text, { kind: "event", event: "song", ...(i.turnId ? { turnId: i.turnId } : {}) });
}

/** "12", "2" or "10:30": the reminder's due time on the demo clock, the way a parent says it. */
async function reminderTime(child: string, ev: NaniEvent, offsetMs: number): Promise<string> {
  let hhmm = "";
  if (ev.jobKey) {
    const { data } = await supabaseAdmin()
      .from("turns")
      .select("meta")
      .eq("child_id", child)
      .eq("kind", "job")
      .eq("meta->>jobKey", ev.jobKey)
      .lte("created_at", new Date(Date.parse(ev.at) + 60_000).toISOString())
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const due = (data?.meta as { dueAt?: unknown } | undefined)?.dueAt;
    if (typeof due === "string") hhmm = due.slice(11, 16); // "2026-11-17T12:00"
  }
  if (!/^\d\d:\d\d$/.test(hhmm)) hhmm = clockParts(new Date(Date.parse(ev.at) + offsetMs)).hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}` : `${h12}`;
}

async function momentAllowed(child: string, lastMomentAt: string | null): Promise<boolean> {
  if (!lastMomentAt) return true;
  const { count, error } = await supabaseAdmin()
    .from("turns")
    .select("id", { count: "exact", head: true })
    .eq("child_id", child)
    .eq("kind", "talk")
    .gt("created_at", lastMomentAt);
  return !error && (count ?? 0) >= MOMENT_EVERY;
}

/** His words as heard, for a quote. */
function quote(text: string): string {
  const t = text.replace(/\s+/g, " ").trim().replace(/^["“'”]+|["“'”]+$/g, "");
  return t.length > 80 ? `${t.slice(0, 77).trimEnd()}…` : t;
}

/** One clean line: no markers, no wrapping quotes, at most 160 characters. */
function clean(text: string): string {
  const s = text
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Unwrap only a fully quoted line, so a note ending in his quoted words keeps its closing quote.
  const t = /^["“][^"“”]*["”]$/.test(s) ? s.slice(1, -1).trim() : s;
  return t.length > 160 ? `${t.slice(0, 157).trimEnd()}…` : t;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
