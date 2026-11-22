// POST /api/chat: a parent's message is sorted to the right agents; each edits only its own file and replies (PLAN.md B5).
import { applyEdit, changeNote, guardEdit } from "@/lib/agents/apply";
import { sortStream, todaysTurns, tomorrowLabel, type SorterAction } from "@/lib/agents/sorter";
import type { SorterInput } from "@/lib/agents/prompt";
import { answerMemoryQuestion, progressViewFor } from "@/lib/agents/memory-answer";
import { broadcastSafe } from "@/lib/broadcast";
import { clockParts, demoNow } from "@/lib/clock";
import { stampOnceDate } from "@/lib/jobs";
import { CHILD_ID } from "@/lib/config";
import { getDemoState } from "@/lib/demo-state";
import { getAllLatest, type WriteResult } from "@/lib/files";
import { post, recent } from "@/lib/messages";
import { BOTS, BOT_KEYS, channelName, type BotKey, type MessageMeta } from "@/lib/types";

export const maxDuration = 60;

const SORRY = "Sorry, say that again?";

interface ActionResult {
  bot: BotKey;
  kind: string;
  changed: boolean;
  file?: string;
  toVersion?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Typing gap between replies: 0.8 to 1.6 s, longer text, longer gap. */
const gapFor = (text: string) => Math.min(1600, Math.max(800, 700 + text.length * 9));

export async function POST(req: Request) {
  const t0 = Date.now();
  let body: { sender?: unknown; text?: unknown; audioUrl?: unknown; clientId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const sender = (typeof body.sender === "string" && body.sender.trim()) || "Parent";
  const audioUrl = typeof body.audioUrl === "string" && body.audioUrl ? body.audioUrl : null;
  const clientId = typeof body.clientId === "string" ? body.clientId : undefined;
  if (!text) return Response.json({ ok: false, error: "text is required" }, { status: 400 });

  const child = CHILD_ID;
  // "working" broadcasts go out in order on one chain; the chain is awaited before returning.
  let chain: Promise<void> = Promise.resolve();
  const working = (bots: BotKey[]) => {
    chain = chain.then(() => broadcastSafe(channelName.chat(child), "working", { bots, on: bots.length > 0 }));
  };

  const results: ActionResult[] = [];
  const ms = { context: 0, firstAction: 0, firstReply: 0, brain: 0, total: 0, attempts: 0, brainProvider: "", brainAttempt: 0 };
  let lastPost = 0;
  let sorted = false;

  try {
    working([...BOT_KEYS]);
    const meta: MessageMeta = { clientId };
    if (audioUrl) Object.assign(meta, { kind: "voice", transcript: text });

    const [parentMsg, files, last, turns, demo] = await Promise.all([
      post(child, sender, "parent", text, meta, audioUrl),
      getAllLatest(child),
      recent(child, 11),
      todaysTurns(child),
      getDemoState(child),
    ]);
    ms.context = Date.now() - t0;
    const nowDate = demoNow(demo.clock_offset_ms);
    const input: SorterInput = {
      sender,
      text,
      files,
      recent: last.filter((m) => m.id !== parentMsg.id).slice(-10),
      turns,
      now: clockParts(nowDate),
      nowTime: `${clockParts(nowDate).hhmm}:${String(nowDate.getUTCSeconds()).padStart(2, "0")}`, // R4.2: to the second
      tomorrow: tomorrowLabel(nowDate),
    };

    // Edits to the same file run one after another; different files run in parallel.
    const note = changeNote(sender, text);
    // Questions about Aarav: start Memory's grounded answer now, in parallel with the sorter (saves ~3 s).
    const looksLikeQuestion = /\?|\b(what|how|did|does|learn|learned|today|kya|kaise|kaisa|kitna)\b/i.test(text);
    const earlyAnswer = looksLikeQuestion ? answerMemoryQuestion(text, sender).catch(() => null) : null;
    const fileChain = new Map<string, Promise<unknown>>();
    const startEdit = (a: SorterAction): Promise<WriteResult | null> => {
      // "once at HH:MM" means today only (R4.1): stamp the demo clock's date on new one-off job lines.
      if (a.bot === "routine" && a.edit?.add?.length) a.edit = { ...a.edit, add: a.edit.add.map((l) => stampOnceDate(l, input.now.dayLabel)) };
      const g = guardEdit(a.bot, a.edit, files);
      if (!g) return Promise.resolve(null);
      const p = (fileChain.get(g.file) ?? Promise.resolve())
        .then(() => applyEdit(child, a.bot, a.edit!, note))
        .catch((e) => {
          console.error(`[chat] ${a.bot} edit failed: ${(e as Error).message}`);
          return null;
        });
      fileChain.set(g.file, p);
      return p;
    };

    let planned: BotKey[] = []; // bots still expected to reply, in order
    const posted: BotKey[] = [];

    // Posts one agent's reply after its edit lands, with a natural gap after the previous reply.
    const reply = async (a: SorterAction, write: Promise<WriteResult | null>) => {
      // Memory's questions get a grounded answer (C12), started now so it runs during the typing gap; the sorter's reply is the fallback.
      const answer =
        a.bot === "memory" && a.kind === "question"
          ? earlyAnswer
            ? earlyAnswer.then((early) => early ?? a.reply)
            : answerMemoryQuestion(text, sender).catch((e) => {
                console.warn(`[chat] memory answer failed: ${(e as Error).message}`);
                return a.reply;
              })
          : null;
      if (lastPost) await sleep(Math.max(0, gapFor(a.reply) - (Date.now() - lastPost)));
      const w = await write;
      const m: MessageMeta = {};
      if (a.bot === "memory") { const v = progressViewFor(text); if (v) m.progress = { view: v }; }
      if (w?.changed) {
        Object.assign(m, {
          file: w.file.name,
          fromVersion: w.fromVersion,
          toVersion: w.toVersion,
          changedLines: w.changedLines,
          ...(w.removedLines.length ? { removedLines: w.removedLines } : {}),
        });
      }
      try {
        await post(child, a.bot, "bot", answer ? await answer : a.reply, m);
        if (!ms.firstReply) ms.firstReply = Date.now() - t0;
      } catch (e) {
        console.error(`[chat] ${a.bot} reply failed: ${(e as Error).message}`);
      }
      lastPost = Date.now();
      posted.push(a.bot);
      const i = planned.indexOf(a.bot);
      if (i >= 0) planned.splice(i, 1);
      working(planned);
      results.push({
        bot: a.bot,
        kind: a.kind,
        changed: !!w?.changed,
        ...(w?.changed ? { file: BOTS[a.bot].file, toVersion: w.toVersion } : {}),
      });
    };

    for (let attempt = 1; attempt <= 2 && !sorted; attempt++) {
      ms.attempts = attempt;
      const held: { a: SorterAction; w: Promise<WriteResult | null> }[] = []; // Memory waits for Lessons (B5)
      try {
        const onServed = (s: { provider: string; attempt: number }) => {
          ms.brainProvider = s.provider;
          ms.brainAttempt = s.attempt;
        };
        for await (const ev of sortStream(input, onServed)) {
          if (ev.type === "bots") {
            planned = ev.bots.filter((b) => !posted.includes(b));
            working(planned);
            continue;
          }
          const a = ev.action;
          if (!ms.firstAction) ms.firstAction = Date.now() - t0;
          sorted = true;
          if (!planned.includes(a.bot)) {
            planned.push(a.bot);
            working(planned);
          }
          const w = startEdit(a);
          if (a.bot === "memory" && planned.includes("lessons") && !posted.includes("lessons")) {
            held.push({ a, w });
            continue;
          }
          await reply(a, w);
          if (a.bot === "lessons") {
            for (const h of held.splice(0)) await reply(h.a, h.w);
          }
        }
      } catch (e) {
        console.warn(`[chat] sorter attempt ${attempt}: ${(e as Error).message}`);
      }
      for (const h of held.splice(0)) await reply(h.a, h.w);
    }
    ms.brain = Date.now() - t0;

    if (!sorted) await reply({ bot: "nani", kind: "chat", edit: null, reply: SORRY }, Promise.resolve(null));
    if (planned.length) working([]);
    ms.total = Date.now() - t0;
    console.log(`[chat] ${JSON.stringify({ text: text.slice(0, 60), ms, actions: results })}`);
    await chain;
    return Response.json({ ok: sorted, actions: results, ms });
  } catch (e) {
    console.error(`[chat] failed: ${(e as Error).message}`);
    if (!results.length) {
      try {
        await post(child, "nani", "bot", SORRY);
        results.push({ bot: "nani", kind: "chat", changed: false });
      } catch (e2) {
        console.error(`[chat] sorry failed: ${(e2 as Error).message}`);
      }
    }
    working([]);
    await chain;
    return Response.json({ ok: false, actions: results, error: (e as Error).message });
  }
}
