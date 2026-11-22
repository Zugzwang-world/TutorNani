"use client";
// The routine clock on /toy and /stage (PLAN.md C10, REFINE R4.3). Reads heartbeat.md and the demo clock live, checks
// four times a second (in seconds, and right after a clock change), and fires each due time once through POST /api/event.
// The logic lives in lib/routine (RoutineScheduler); this hook only drives it:
//   - a due job waits until the page is awake and Nani is idle (isIdle: not listening, thinking or speaking, no call),
//     then fires within 250 ms; one job at a time;
//   - a new job line whose slot is already due ("now": Routine wrote the time a few seconds before the page saw the
//     line) fires at once if the slot is at most 2 minutes old;
//   - with several pages open, the server's fire-once key (turns_job_once) stops doubles: the loser plays nothing.
//
// Wiring (use-toy.ts):
//   const routine = useRoutine({ play, setLastEvent, onCall, enabled: core.awake, isIdle, talkState });
// `play(url)` plays an mp3 url through the toy's audio; `setLastEvent` records what Nani did last so the next child
// turn knows. useRoutineBoard() gives the stage's jobs board the same jobs, clock and fires (a module-level store:
// one toy per page).
//
// It uses its OWN Supabase client: supabase-js returns the same channel object for the same topic, so
// re-using the page's toy:aarav channel would throw on `.on()` after subscribe. One extra socket is cheap.
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { audioById } from "@/lib/audio";
import { clockParts, demoNow } from "@/lib/clock";
import { CHILD_ID } from "@/lib/config";
import { parseJobs } from "@/lib/jobs";
import { RoutineScheduler, fireId, type ClockReading, type DueJob } from "@/lib/routine";
import { channelName, type Job, type NaniEvent } from "@/lib/types";

export type CallWho = "mumma" | "papa";

export interface RoutineOptions {
  /** Play an mp3 url (public path like /audio/song.mp3 or a Supabase url) through the toy's audio. */
  play: (url: string) => void | Promise<void>;
  /** Record the toy's last non-reply event; the next child turn sends it to /api/turn. */
  setLastEvent: (e: NaniEvent) => void;
  /** A call job fired. Default (omitted): broadcast toy:aarav `call` { state: "ringing" }. */
  onCall?: (who: CallWho) => void;
  /** Sound is unlocked (the page is awake). Until then due jobs wait. Default true. */
  enabled?: boolean;
  /** Nani is free: not listening, thinking or speaking, and no call is open. A due job waits for it. Default: always free. */
  isIdle?: () => boolean;
  /** The talk state, so a held job fires the moment Nani goes idle (the 250 ms check catches it too). */
  talkState?: string;
}

const TICK_MS = 250;
const DAY_MS = 86_400_000;
/** A reminder that never reports its end (a suspended AudioContext) frees the routine after this long. */
const PLAY_MAX_MS = 45_000;
/** A fire that didn't reach the server is tried again this many times, this far apart. */
const RETRIES = 2;
const RETRY_MS = 1500;

/** The demo clock in India time, to the second, from one Date (India is a whole number of minutes off UTC). */
const reading = (offsetMs: number): ClockReading => {
  const d = demoNow(offsetMs);
  const p = clockParts(d);
  return { seconds: p.minutes * 60 + d.getUTCSeconds(), dateKey: p.dateKey, dayLabel: p.dayLabel };
};
const tomorrowOf = (offsetMs: number): ClockReading => {
  const t = clockParts(new Date(demoNow(offsetMs).getTime() + DAY_MS));
  return { seconds: -1, dateKey: t.dateKey, dayLabel: t.dayLabel };
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const isGoodNight = (text: string) => {
  const g = audioById("line_good_night")?.text;
  return !!g && norm(g) === norm(text);
};

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

export function whoOf(text: string): CallWho {
  return /mumma|mummy|mom|mama|mother|maa/i.test(text) ? "mumma" : "papa";
}

/** Casual chat line Routine posts when it acts. Null: post nothing. */
function chatText(job: Job): string | null {
  switch (job.action) {
    case "say":
      if (isGoodNight(job.text)) return "Said good night to Aarav 🌙";
      return `Reminded Aarav: ${job.text} ${/paani|water|pani/i.test(job.text) ? "💧" : "🔔"}`;
    case "call":
      return `Calling ${whoOf(job.text) === "mumma" ? "Mumma" : "Papa"} now 📞`;
    case "song":
      return "Played the song for Aarav 🎵";
    case "brief":
      return null;
  }
}

// ---------- the jobs board's store (one toy per page) ----------

export interface RoutineBoard {
  loaded: boolean;
  jobs: Job[];
  offsetMs: number;
  /** jobKey -> dueAt of a slot that is due and waiting for Nani. */
  held: Record<string, string>;
  /** jobKey of the job firing now (posting, then playing). */
  firing: string | null;
  /** jobKey -> its last fire: the slot, the demo clock's HH:MM when it fired, and Date.now() then. */
  fired: Record<string, { dueAt: string; hhmm: string; at: number }>;
}

const EMPTY: RoutineBoard = { loaded: false, jobs: [], offsetMs: 0, held: {}, firing: null, fired: {} };
let board: RoutineBoard = EMPTY;
const boardSubs = new Set<() => void>();
function setBoard(patch: Partial<RoutineBoard> | null) {
  board = patch ? { ...board, ...patch } : EMPTY;
  boardSubs.forEach((f) => f());
}
const subscribeBoard = (cb: () => void) => {
  boardSubs.add(cb);
  return () => {
    boardSubs.delete(cb);
  };
};

/** The routine's jobs, demo clock and fires, for the stage's jobs board. Updates only when something changes. */
export function useRoutineBoard(): RoutineBoard {
  return useSyncExternalStore(subscribeBoard, () => board, () => EMPTY);
}

// ---------- the hook ----------

export function useRoutine(opts: RoutineOptions): { offsetMs: number; jobs: Job[] } {
  const [offsetMs, setOffsetMs] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);

  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const flushRef = useRef<() => void>(() => {});
  const fireNextRef = useRef<() => void>(() => {});

  // Nani just went idle, or the page just woke: fire a held job now.
  const enabled = opts.enabled !== false;
  useEffect(() => {
    flushRef.current();
  }, [enabled, opts.talkState]);

  useEffect(() => {
    const sb: SupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let dead = false;
    let toyCh: RealtimeChannel | null = null;
    const sched = new RoutineScheduler();
    const loaded = { jobs: false, clock: false };
    let offset = 0;
    let acting = false;
    const attempts = new Map<string, number>();

    const publishHeld = () => {
      const held: Record<string, string> = {};
      for (const [k, d] of sched.held) held[k] = d.dueAt;
      const a = Object.keys(held);
      const b = Object.keys(board.held);
      if (a.length === b.length && a.every((k) => board.held[k] === held[k])) return;
      setBoard({ held });
    };

    // ----- Nani's voice for a reminder: /api/say, started as soon as the line appears (cached by text) -----
    const sayCache = new Map<string, Promise<string | null>>();
    const sayUrl = (text: string): Promise<string | null> => {
      let p = sayCache.get(text);
      if (!p) {
        p = postJson("/api/say", { text }).then((s) => (s.ok && typeof s.data.url === "string" ? s.data.url : null));
        sayCache.set(text, p);
        void p.then((u) => {
          if (!u) sayCache.delete(text); // failed: the fire tries again
        });
      }
      return p;
    };
    const prefetch = (list: Job[]) => {
      for (const j of list) if (j.action === "say" && !isGoodNight(j.text)) void sayUrl(j.text);
    };

    const playId = async (id: string) => {
      const f = audioById(id)?.file;
      if (f) await optsRef.current.play(f);
    };
    const playUrl = async (url: string) => {
      await Promise.race([optsRef.current.play(url), new Promise((r) => setTimeout(r, PLAY_MAX_MS))]);
    };

    // ----- acting on one due job (one at a time) -----
    const act = async (d: DueJob) => {
      const { job, dueAt } = d;
      const id = fireId(job.key, dueAt);
      const t0 = performance.now();
      const speech = job.action === "say" && !isGoodNight(job.text) ? sayUrl(job.text) : null; // in parallel with the event
      setBoard({ firing: job.key });
      const text = chatText(job);
      const r = await postJson("/api/event", {
        bot: "routine",
        ...(text ? { text } : {}),
        turn: { kind: "job", meta: { jobKey: job.key, dueAt, action: job.action, text: job.text } },
      });
      const tEvent = Math.round(performance.now() - t0);
      if (!r.ok) {
        const n = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, n);
        console.warn(`[routine] fire ${id} failed (${r.status}), attempt ${n}`);
        if (n > RETRIES) sched.failed(d); // Fire next can still send it
        else
          setTimeout(() => {
            if (dead) return;
            sched.failed(d, reading(offset)); // hold it again
            flushRef.current();
          }, RETRY_MS);
        return;
      }
      const hhmm = clockParts(demoNow(offset)).hhmm;
      setBoard({ fired: { ...board.fired, [job.key]: { dueAt, hhmm, at: Date.now() } } });
      if (r.data.duplicate) {
        console.log(`[routine] ${id} already fired on another page (${tEvent} ms)`);
        return;
      }
      const at = new Date().toISOString();
      const o = optsRef.current;
      try {
        if (job.action === "say") {
          o.setLastEvent({ kind: "reminder", text: job.text, jobKey: job.key, at });
          if (!speech) await playId("line_good_night");
          else {
            const url = await speech;
            console.log(`[routine] fire ${id} (say): event ${tEvent} ms, voice ${Math.round(performance.now() - t0)} ms, playing at ${new Date().toISOString()}`);
            if (url) await playUrl(url);
          }
        } else if (job.action === "call") {
          const who = whoOf(job.text);
          console.log(`[routine] fire ${id} (call ${who}): event ${tEvent} ms, ringing at ${new Date().toISOString()}`);
          o.setLastEvent({ kind: "call", text: `Calling ${who === "mumma" ? "Mumma" : "Papa"}`, jobKey: job.key, at });
          await playId(`line_call_${who}`);
          if (o.onCall) o.onCall(who);
          else toyCh?.send({ type: "broadcast", event: "call", payload: { callId: crypto.randomUUID(), state: "ringing", who } });
        } else if (job.action === "brief") {
          o.setLastEvent({ kind: "brief", text: job.text, jobKey: job.key, at });
          await postJson("/api/brief", {});
        } else if (job.action === "song") {
          o.setLastEvent({ kind: "song", text: audioById("song")?.text ?? "the song", jobKey: job.key, at });
          await playId("song");
        }
      } catch (e) {
        console.error("routine: act failed", e);
      }
    };

    /** Fire the earliest held job if the page is awake, Nani is idle and nothing else is firing. */
    const flush = () => {
      if (dead || acting || !loaded.jobs || !loaded.clock) return;
      const o = optsRef.current;
      if (o.enabled === false || (o.isIdle && !o.isIdle())) return;
      const d = sched.take();
      if (!d) return;
      acting = true;
      publishHeld();
      void act(d).finally(() => {
        acting = false;
        if (dead) return;
        setBoard({ firing: null });
        publishHeld();
        flush();
      });
    };
    flushRef.current = flush;

    // ----- the check -----
    const check = () => {
      if (dead || !loaded.jobs || !loaded.clock) return;
      sched.tick(reading(offset));
      publishHeld();
      flush();
    };

    // "Fire next job" (presenter): a held job first, else the reminder that just didn't fire, else the next one.
    fireNextRef.current = () => {
      if (!loaded.jobs) return;
      const d = sched.fireNext(reading(offset), tomorrowOf(offset));
      console.log(`[routine] fire next: ${d ? fireId(d.job.key, d.dueAt) : "nothing to fire"}`);
      publishHeld();
      flush();
    };

    const applyJobs = (content: string | null | undefined) => {
      const list = parseJobs(content ?? "");
      const now = loaded.clock ? reading(offset) : null;
      const caught = sched.setJobs(list, now);
      for (const d of caught) console.log(`[routine] new line already due: ${fireId(d.job.key, d.dueAt)}, seen at ${new Date().toISOString()}`);
      loaded.jobs = true;
      setJobs(list);
      setBoard({ loaded: loaded.clock, jobs: list });
      publishHeld();
      prefetch(list);
      flush();
    };
    const applyOffset = (ms: unknown) => {
      if (typeof ms !== "number" || !Number.isFinite(ms)) return;
      if (loaded.clock && ms === offset) return;
      offset = ms;
      loaded.clock = true;
      setOffsetMs(ms);
      setBoard({ offsetMs: ms, loaded: loaded.jobs });
      check(); // right after a clock change
    };

    // ----- reads -----
    const filter = `child_id=eq.${CHILD_ID}`;
    const readJobs = () =>
      sb
        .from("agent_files")
        .select("content")
        .eq("child_id", CHILD_ID)
        .eq("name", "heartbeat")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (!dead && data) applyJobs(data.content);
          else if (!dead && !loaded.jobs) applyJobs("");
        });
    void readJobs();
    sb.from("demo_state")
      .select("clock_offset_ms")
      .eq("child_id", CHILD_ID)
      .maybeSingle()
      .then(({ data }) => {
        if (dead) return;
        applyOffset(data ? data.clock_offset_ms : 0);
      });

    // ----- live: heartbeat.md, demo_state, toy broadcasts -----
    let subscribedOnce = false;
    const dbCh = sb
      .channel(`routine-db:${CHILD_ID}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_files", filter }, (p) => {
        const row = p.new as { name?: string; content?: string };
        if (row?.name === "heartbeat") applyJobs(row.content);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_state", filter }, (p) => {
        applyOffset((p.new as { clock_offset_ms?: number })?.clock_offset_ms);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (subscribedOnce) void readJobs(); // a reconnect may have missed a new line
        subscribedOnce = true;
      });

    toyCh = sb
      .channel(channelName.toy(CHILD_ID))
      .on("broadcast", { event: "clock" }, ({ payload }) => applyOffset(payload?.offsetMs))
      .on("broadcast", { event: "fire_next_job" }, () => fireNextRef.current())
      .subscribe();

    const timer = setInterval(check, TICK_MS);
    return () => {
      dead = true;
      clearInterval(timer);
      setBoard(null);
      void sb.removeChannel(dbCh);
      if (toyCh) void sb.removeChannel(toyCh);
      void sb.realtime.disconnect();
    };
  }, []);

  return { offsetMs, jobs };
}
