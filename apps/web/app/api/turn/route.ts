// POST /api/turn: one child turn, streamed as NDJSON TurnEvents (PLAN.md C2, CONTRACTS.md).
//
//   heard -> say (i = 0, 1, … in order) -> [fallback] -> done
//
// Hops: speech-to-text (skipped for a `text` field) -> brain stream -> sentence split -> one TTS per
// sentence, all in parallel -> emitted strictly in order. Files, recent turns and changes load in
// parallel with speech-to-text. The turn row is written right after `done`; the outcome note (B8) and the song
// event are decided in `after()`, once the response has closed, so they never slow a turn.
import { after } from "next/server";
import {
  groupChanges,
  isReported,
  loadChangeRows,
  loadReported,
  newSince,
  routineOnly,
  seenBy,
  vkey,
  type ChangeRow,
  type Reported,
} from "@/lib/agents/changes";
import { postTurnOutcomes, type TurnOutcomeInput } from "@/lib/agents/turn-notes";
import { brainStreamRetry, type BrainServed } from "@/lib/brain";
import { clockParts, demoNow } from "@/lib/clock";
import { CHILD_ID, config } from "@/lib/config";
import { stt, tts } from "@/lib/eleven";
import { getAllLatest } from "@/lib/files";
import { parseMarkers, stripMarkers } from "@/lib/markers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { FILE_NAMES, type AgentFile, type BoardState, type Cue, type FileName, type NaniEvent, type Note, type Turn, type TurnEvent } from "@/lib/types";
import { checkClip, cleanSpeech } from "@/lib/voice/speech";
import { SentenceSplitter, isAudioMarker } from "@/lib/voice/split";
import { bridgeKeyterms, buildTurnPrompt } from "./prompt";

export const maxDuration = 60;

const BRAIN_MAX_TOKENS = 150;
const FIRST_TOKEN_TIMEOUT_MS = 7000; // no brain token by then: slow_brain (the toy's own fallback is at 8 s)
const BRAIN_RETRY_MS = 2300; // no first token by then: cancel and send one fresh request (up to 3 attempts in all)
const SOUND_ONLY = "(Aarav made a sound, not words: maybe a roar, a laugh or an animal noise)";
// Speech-to-text tags for room noise, music, breath or silence: these presses stay "not heard", not a roar.
const NOISE_TAG = /लगातार|शोर|संगीत|सन्नाटा|खामोशी|चुप्पी|साँस|सांस|हवा|noise|music|static|silence|background|hum|beep|click|wind|breath|typing/i;
// Aarav agreeing to a call: "Haan", "yes", "ok", "chalo", "Mumma ko sunao/dikhao", "call karo".
const SAID_YES = /\b(haan|ha|haanji|han|yes|yeah|ok|okay|chalo|theek)\b|हाँ|हां|हा\b|ठीक|चलो|(mumma|mummy|papa|मम्मा|मम्मी|पापा)\s*(ko|को)\s*(sunao|dikhao|bulao|सुनाओ|दिखाओ|बुलाओ)|call\s*(karo|kar)|कॉल/i;
const BRAIN_IDLE_MS = 3000; // no new token for this long after the first: end the reply
const TTS_TIMEOUT_MS = 5000; // one sentence of voice; past this it counts as voice_failed
// Hinglish TTS language. Tested "hi" vs none on 4 Hinglish lines (transcribed back): identical words,
// "hi" slightly faster, so keep config.nani.languageCode ("hi"). undefined = config; "" = none.
const TTS_LANGUAGE: string | undefined = undefined;
// Child speech is Hindi + English. Auto-detect heard "Aam!" as "Arm" and "Haan!" as "Huh";
// "hi" got आम and हाँ, kept "Lion" and "Thank you" in English, and was ~80 ms faster.
const STT_LANGUAGE = "hi";
// Today's bridge words (planner.md) go to speech-to-text as keyterms (R6.2): with them "Chand!" came back
// "Chand." instead of "चंड।", at no measurable STT cost. The files read starts with the request; past this wait
// speech-to-text goes without keyterms rather than wait on the database.
const KEYTERMS_WAIT_MS = 250;
const UNUSED_MAX = 3; // earlier parent changes still listed as "not used yet"
const UNUSED_TURNS = 5; // ... for at most this many talk turns after they arrived

interface Chunk {
  i: number;
  raw: string; // the sentence plus any markers attached before it is sent
  speech: string; // what is voiced; fixed when the chunk is cut
  tts: Promise<Uint8Array> | null; // null for a cue-only chunk
  cutAt: number;
  ttsMs?: number;
  bytes?: number;
  emitted: boolean;
}

type Timings = Record<string, number>;

export async function POST(req: Request) {
  const t0 = performance.now();
  const since = () => Math.round(performance.now() - t0);

  const form = await req.formData();
  const input = {
    audio: form.get("audio"),
    text: str(form.get("text")),
    sessionId: str(form.get("sessionId")) || null,
    board: json<BoardState>(form.get("board")),
    lastEvent: json<NaniEvent>(form.get("lastEvent")),
    clockOffsetMs: Number(form.get("clockOffsetMs") ?? 0) || 0,
  };
  const timings: Timings = { form: since() };

  // The outcome note and song event run after the response closes (B8). runTurn hands over what they need.
  let settle: (v: TurnOutcomeInput | null) => void = () => {};
  const outcome = new Promise<TurnOutcomeInput | null>((r) => (settle = r));
  after(async () => {
    const o = await outcome;
    if (o) await postTurnOutcomes(o);
  });

  // One abort for everything downstream: the client leaving (barge-in) stops brain and TTS spend.
  const ac = new AbortController();
  const onClientAbort = () => ac.abort();
  req.signal.addEventListener("abort", onClientAbort);

  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (ev: TurnEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
        } catch {
          closed = true;
        }
      };
      runTurn(input, timings, since, emit, ac)
        .then(settle, (e) => {
          console.error(`[turn] crashed: ${msg(e)}`);
          settle(null);
        })
        .finally(() => {
          req.signal.removeEventListener("abort", onClientAbort);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {}
          }
        });
    },
    cancel() {
      closed = true;
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

interface TurnInput {
  audio: FormDataEntryValue | null;
  text: string;
  sessionId: string | null;
  board: BoardState | null;
  lastEvent: NaniEvent | null;
  clockOffsetMs: number;
}

async function runTurn(
  input: TurnInput,
  timings: Timings,
  since: () => number,
  emit: (ev: TurnEvent) => void,
  ac: AbortController,
): Promise<TurnOutcomeInput | null> {
  const filesP = getAllLatest(CHILD_ID); // shared: keyterms for speech-to-text, and the prompt
  filesP.catch(() => {});
  const ctxP = loadContext(CHILD_ID, filesP);
  ctxP.catch(() => {}); // handled below; avoid an unhandled rejection on the early exits

  // Which brain served the first token (provider, attempt): next to the hop timings, so a Kimi fallback shows.
  let served: BrainServed | null = null;
  const brainTag = () => (served ? { brainProvider: served.provider, brainAttempt: served.attempt } : {});
  const finish = (extra: Record<string, unknown> = {}) => {
    timings.total = since();
    emit({
      t: "done",
      ms: { stt: timings.stt ?? -1, brainFirst: timings.brainFirst ?? -1, voiceFirst: timings.voiceFirst ?? -1, total: timings.total, ...brainTag() },
    });
    console.log(`[turn] ${JSON.stringify({ ...timings, ...brainTag(), ...extra })}`);
  };

  // ---- 1. Hear ----
  let childText = "";
  if (input.text.trim()) {
    childText = input.text.trim();
    timings.stt = 0;
  } else if (input.audio instanceof Blob && input.audio.size > 0) {
    const tk = performance.now();
    const keyterms = await withinMs(filesP.then((f) => bridgeKeyterms(f.planner.content)), KEYTERMS_WAIT_MS, [] as string[]);
    timings.keyterms = Math.round(performance.now() - tk);
    timings.keytermCount = keyterms.length;
    const t = performance.now();
    try {
      const name = input.audio instanceof File && input.audio.name ? input.audio.name : "turn.webm";
      const r = await stt(input.audio, { filename: name, languageCode: STT_LANGUAGE, keyterms, signal: ac.signal });
      // Audio events are tagged ([roar], (laughs)): a press with only a sound is a roar or a laugh, not silence.
      const words = r.text.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
      childText = /[\p{L}\p{N}]/u.test(words) ? words : /[\[(]/.test(r.text) && !NOISE_TAG.test(r.text) ? SOUND_ONLY : "";
    } catch (e) {
      if (ac.signal.aborted) return null;
      console.warn(`[turn] stt failed: ${msg(e)}`);
    }
    timings.stt = Math.round(performance.now() - t);
    childText = snapToTiles(childText, input.board);
  }
  emit({ t: "heard", text: childText });
  if (!childText) {
    emit({ t: "fallback", id: "not_heard" });
    finish({ fallback: "not_heard", audioBytes: input.audio instanceof Blob ? input.audio.size : 0 });
    return null;
  }

  // ---- 2. Prompt (files read fresh every turn) ----
  let ctx: Awaited<ReturnType<typeof loadContext>>;
  try {
    ctx = await ctxP;
  } catch (e) {
    console.error(`[turn] context failed: ${msg(e)}`);
    emit({ t: "fallback", id: "slow_brain" });
    finish({ fallback: "slow_brain", error: msg(e) });
    return null;
  }
  timings.ctx = since();
  // The child is answering this event if he has not talked since it happened.
  const ev = input.lastEvent;
  const lastEventFresh = !!ev && (!ctx.lastTalk || Date.parse(ctx.lastTalk.created_at) < Date.parse(ev.at));
  const messages = buildTurnPrompt({
    files: ctx.files,
    recentTurns: ctx.recentTurns,
    changes: ctx.changes,
    unused: ctx.unused,
    board: input.board,
    lastEvent: ev,
    lastEventFresh,
    clockOffsetMs: input.clockOffsetMs,
    clock: clockParts(demoNow(input.clockOffsetMs)),
    childText,
  });

  // ---- 3 + 4. Brain stream -> sentences -> parallel TTS ----
  const work = new AbortController(); // brain + TTS; also stopped on a voice failure
  ac.signal.addEventListener("abort", () => work.abort());
  const splitter = new SentenceSplitter();
  const chunks: Chunk[] = [];
  let producerDone = false;
  let brainError: string | null = null;
  let reply = "";
  let wake: (() => void) | null = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };

  const addChunk = (raw: string) => {
    const speech = cleanSpeech(stripMarkers(raw));
    const c: Chunk = { i: chunks.length, raw, speech, tts: null, cutAt: since(), emitted: false };
    if (speech) {
      const t = performance.now();
      c.tts = tts(speech, { languageCode: TTS_LANGUAGE, signal: AbortSignal.any([work.signal, AbortSignal.timeout(TTS_TIMEOUT_MS)]) }).then((b) => {
        c.ttsMs = Math.round(performance.now() - t);
        c.bytes = b.length;
        return b;
      });
      c.tts.catch(() => {});
    }
    if (timings.firstCut === undefined) timings.firstCut = since();
    chunks.push(c);
    notify();
  };

  // Display markers that follow a sentence belong to it, as long as it has not been sent.
  const attachTrailing = () => {
    const last = chunks.at(-1);
    if (!last || last.emitted) return;
    let m: string | null;
    while ((m = splitter.shiftLeadingMarker((raw) => !isAudioMarker(raw)))) last.raw += ` ${m}`;
  };

  const producer = (async () => {
    const brainAc = new AbortController();
    work.signal.addEventListener("abort", () => brainAc.abort());
    const timer = setTimeout(() => {
      if (timings.brainFirst === undefined) {
        brainError = `no token in ${FIRST_TOKEN_TIMEOUT_MS} ms`;
        brainAc.abort();
      }
    }, FIRST_TOKEN_TIMEOUT_MS);
    // A stall after the first token ends the reply with what we have (reviewer: the turn must always close).
    let stalled = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const bumpIdle = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        stalled = true;
        console.warn(`[turn] brain stalled ${BRAIN_IDLE_MS} ms mid-reply; speaking what we have`);
        brainAc.abort();
      }, BRAIN_IDLE_MS);
    };
    try {
      const onServed = (s: BrainServed) => (served = s);
      for await (const d of brainStreamRetry({ messages, maxTokens: BRAIN_MAX_TOKENS, signal: brainAc.signal, retryAfterMs: BRAIN_RETRY_MS, attempts: 3, label: "turn", onServed })) {
        if (timings.brainFirst === undefined) {
          timings.brainFirst = since();
          clearTimeout(timer);
        }
        bumpIdle();
        reply += d;
        splitter.push(d);
        for (;;) {
          attachTrailing();
          const s = splitter.next(chunks.length === 0);
          if (s === null) break;
          addChunk(s);
        }
      }
      timings.brainDone = since();
    } catch (e) {
      if (!work.signal.aborted && !stalled) brainError = brainError ?? msg(e);
    } finally {
      clearTimeout(timer);
      if (idle) clearTimeout(idle);
    }
    if (!brainError && !work.signal.aborted) {
      attachTrailing();
      const rest = splitter.flush();
      if (rest) {
        const last = chunks.at(-1);
        const restSpeech = cleanSpeech(stripMarkers(rest));
        const restHasAudio = parseMarkers(rest).cues.some((c) => c.type === "sound" || c.type === "song");
        if (!restSpeech && last && !last.emitted && !restHasAudio) last.raw += ` ${rest}`;
        else addChunk(rest);
      }
    }
    producerDone = true;
    notify();
  })();

  // ---- Emit strictly in order, with the live speech check (C8) ----
  const sent: { speech: string; cues: Cue[]; notes: Note[]; invalid: string[] }[] = [];
  let voiceFailed: string | null = null;
  let next = 0;
  let sayIndex = 0;
  for (;;) {
    if (next < chunks.length) {
      const c = chunks[next++];
      let audio = "";
      if (c.tts) {
        let bytes: Uint8Array | null = null;
        let err = "";
        try {
          bytes = await c.tts;
        } catch (e) {
          err = msg(e);
        }
        if (ac.signal.aborted) break;
        const check = bytes ? checkClip(bytes.length, c.speech, config.nani.outputFormat) : null;
        if (!bytes || !check?.ok) {
          voiceFailed = err || `${check?.reason} (${check?.seconds.toFixed(2)} s for ${c.speech.length} chars)`;
          console.warn(`[turn] voice_failed on sentence ${c.i}: ${voiceFailed} :: ${c.speech}`);
          emit({ t: "fallback", id: "voice_failed" });
          work.abort();
          break;
        }
        audio = Buffer.from(bytes).toString("base64");
        if (timings.voiceFirst === undefined) timings.voiceFirst = since();
      }
      c.emitted = true;
      const parsed = parseMarkers(c.raw);
      // A call starts at once (N2), so only when Aarav actually said yes to it; otherwise the cue is dropped.
      if (!SAID_YES.test(childText)) parsed.cues = parsed.cues.filter((q) => q.type !== "call");
      // A remainder with only a note has nothing to play or show: keep the note, send no `say`.
      if (c.speech || parsed.cues.length) emit({ t: "say", i: sayIndex++, text: c.speech, cues: parsed.cues, audio });
      sent.push({ speech: c.speech, cues: parsed.cues, notes: parsed.notes, invalid: parsed.invalid });
      continue;
    }
    if (producerDone) break;
    await new Promise<void>((r) => (wake = r));
  }
  await producer;
  if (ac.signal.aborted) {
    console.log(`[turn] aborted by client at ${since()} ms after ${sent.length} sentences ${JSON.stringify({ ...timings, ...brainTag(), heard: childText })}`);
    return null;
  }

  const spoken = sent.map((s) => s.speech).filter(Boolean).join(" ");
  // A cue-only reply (e.g. just [[song]] or [[sound lion]]) already went out as a `say` with cues: the toy plays it.
  const hasCues = sent.some((x) => x.cues.length > 0);
  if (!spoken && !hasCues && !voiceFailed) emit({ t: "fallback", id: "slow_brain" });

  const sentenceLog = chunks.map((c) => ({ i: c.i, cutAt: c.cutAt, ttsMs: c.ttsMs, kb: c.bytes ? +(c.bytes / 1024).toFixed(1) : 0, text: c.speech }));
  const newChanges = ctx.changes.flatMap((g) => g.versions);
  finish({ heard: childText, reply, brainError, voiceFailed, newChanges, unused: ctx.unused.length, sentences: sentenceLog });

  // ---- 5. The turn row (before the stream closes: the next turn's "changes since" diff reads it). Only
  // for turns Nani actually spoke, so a parent's change is not "used up" by a misheard press. The note
  // is decided in after() (route POST). ----
  if (!spoken) return null;
  const fileVersions = Object.fromEntries(FILE_NAMES.map((n) => [n, ctx.files[n].version])) as Record<FileName, number>;
  const cues = sent.flatMap((s) => s.cues);
  const notes = sent.flatMap((s) => s.notes);
  let turnId: number | null = null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("turns")
      .insert({
        child_id: CHILD_ID,
        session_id: input.sessionId,
        kind: "talk",
        child_text: childText,
        nani_text: spoken,
        cues,
        file_versions: fileVersions,
        timings: { ...timings, ...brainTag() },
        meta: {
          reply,
          notes,
          invalid: sent.flatMap((s) => s.invalid),
          board: input.board,
          lastEvent: input.lastEvent,
          newChanges,
          ...(voiceFailed ? { voiceFailed } : {}),
          ...(brainError ? { brainError } : {}),
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    turnId = (data as { id: number }).id;
  } catch (e) {
    console.error(`[turn] save failed: ${msg(e)}`);
  }
  return {
    child: CHILD_ID,
    turnId,
    childText,
    reply,
    cues,
    naniNotes: notes,
    lastEvent: ev,
    lastEventFresh,
    clockOffsetMs: input.clockOffsetMs,
    fileVersions,
  };
}

// ---------- Context: files, last 8 turns, changes since the child's last talk turn (B7) ----------
// All four reads run in parallel (and in parallel with speech-to-text). "Since the last turn" is by version:
// a file version is new if it is newer than the one the previous talk turn used (turns.file_versions), so a
// change that lands during a turn is still new for the next one.

async function loadContext(child: string, filesP: Promise<Record<FileName, AgentFile>>) {
  const recent = supabaseAdmin()
    .from("turns")
    .select("*")
    .eq("child_id", child)
    .not("nani_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(8)
    .then(({ data, error }) => {
      if (error) throw new Error(`turns.recent: ${error.message}`);
      return (data as Turn[]).reverse();
    });
  // The change lists are extras: if they fail, the turn still runs on the latest files.
  const [files, recentTurns, rows, reported] = await Promise.all([
    filesP,
    recent,
    soft(loadChangeRows(child), [] as ChangeRow[], "changes"),
    soft(loadReported(child), { versions: new Set(), events: new Set(), lastMomentAt: null } as Reported, "reported"),
  ]);
  // Job turns carry no nani_text, so the last talk turn is among the last 8 spoken ones.
  const lastTalk = recentTurns.findLast((t) => t.kind === "talk") ?? null;

  const seen = seenBy(rows, Object.fromEntries(FILE_NAMES.map((n) => [n, files[n].version])));
  const fresh = newSince(seen, lastTalk?.file_versions ?? null);
  const freshKeys = new Set(fresh.map((r) => vkey(r.name, r.version)));
  const talksSince = (at: string) => recentTurns.filter((t) => t.kind === "talk" && Date.parse(t.created_at) > Date.parse(at)).length;
  const unused = groupChanges(seen.filter((r) => !freshKeys.has(vkey(r.name, r.version))))
    .filter((g) => !routineOnly(g) && !isReported(g, reported) && talksSince(g.at) < UNUSED_TURNS)
    .slice(-UNUSED_MAX);
  return { files, recentTurns, lastTalk, changes: groupChanges(fresh), unused };
}

function soft<T>(p: PromiseLike<T>, empty: T, what: string): Promise<T> {
  return Promise.resolve(p).catch((e) => {
    console.warn(`[turn] ${what} failed: ${msg(e)}`);
    return empty;
  });
}

// ---------- helpers ----------

/** The promise's value if it settles within `ms`, else (or on error) `fallback`. */
function withinMs<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((r) => (timer = setTimeout(() => r(fallback), ms)));
  return Promise.race([p.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

function json<T>(v: FormDataEntryValue | null): T | null {
  if (typeof v !== "string" || !v || v === "null") return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// A single spoken letter is often misheard ("M" → "N", "S" → "Yes"). While a spelling is on the wall,
// a one-word answer that sounds like a letter snaps to the board's tiles (M and N count as one sound).
const LETTER_SOUNDS: Record<string, string> = {
  em: "M", aem: "M", yem: "M", "एम": "M", "ऍम": "M", "म": "M",
  en: "N", "एन": "N", "न": "N",
  es: "S", ess: "S", yes: "S", "एस": "S", "स": "S",
  tee: "T", ti: "T", "टी": "T", "ट": "T",
  ay: "A", "ए": "A", bee: "B", "बी": "B", see: "C", "सी": "C", dee: "D", "डी": "D",
  oh: "O", "ओ": "O", pee: "P", "पी": "P", are: "R", "आर": "R",
};
function snapToTiles(text: string, board: BoardState | null | undefined): string {
  const tiles = board?.spell && !board.spell.filled ? board.spell.tiles.map((x) => x.toUpperCase()) : [];
  if (!tiles.length) return text;
  const w = text.trim().toLowerCase().replace(/[.!?।,]/g, "").trim();
  if (!w || w.includes(" ") || w.length > 4) return text;
  let letter = /^[a-z]$/.test(w) ? w.toUpperCase() : LETTER_SOUNDS[w];
  if (!letter) return text;
  if (!tiles.includes(letter)) {
    if (letter === "N" && tiles.includes("M")) letter = "M";
    else if (letter === "M" && tiles.includes("N")) letter = "N";
    else return text;
  }
  return letter;
}

