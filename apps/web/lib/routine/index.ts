// Routine clock, pure logic (PLAN.md C10, REFINE R4.3). Which jobs are due on the demo clock, in seconds, and the
// scheduler that holds a due job until Nani is free and fires each due time once.
// Relative imports only (no Next.js alias, no config) so the tests run with plain tsc + node. Safe on client and server.
import { fromMinutes, jobSecondsOn } from "../jobs";
import type { Job } from "../types";

/** The demo clock reading in India time. The hook builds it from one Date: clockParts(d).minutes * 60 + d.getUTCSeconds(). */
export interface ClockReading {
  seconds: number; // seconds after midnight
  dateKey: string; // "2026-11-17"
  dayLabel: string; // "17 Nov"
}

export interface DueJob {
  job: Job;
  /** `${dateKey}T${HH:MM}`, e.g. "2026-11-17T12:00". Minute resolution: one job's slots are always at least 60 s apart,
   * and older pages and turn-notes read the same key (the turns_job_once index de-duplicates on it). */
  dueAt: string;
  dateKey: string;
  seconds: number; // due time, seconds after midnight
}

export const dueAtOf = (dateKey: string, seconds: number) => `${dateKey}T${fromMinutes(Math.floor(seconds / 60))}`;

export const fireId = (jobKey: string, dueAt: string) => `${jobKey}@${dueAt}`;

const slot = (job: Job, dateKey: string, seconds: number): DueJob => ({ job, dueAt: dueAtOf(dateKey, seconds), dateKey, seconds });

/** Window start for a first check: fires a slot due this very second, never backfills the day. */
export const startWindow = (nowSeconds: number) => nowSeconds - 1;

/** How far back a forward clock jump reaches for a skipped daily or one-off job (s). Older slots are stale, so +2 h at
 * 18:45 does not replay the 19:00 brief. Repeating ("every") jobs reach back over the whole jump: +2 h always fires the
 * water reminder it skipped, however long the presenter waited before pressing it. */
export const LOOKBACK_S = 30 * 60;

/** A job line that shows up with its slot already due (Routine wrote "from 01:16:05" for "now", and the page sees the line
 * a few seconds later) still fires if that slot is at most this old (s). */
export const CATCH_UP_S = 120;

/** A due job waits for Nani (talking, a call) at most this long on the demo clock (s), then it is dropped. */
export const HOLD_MAX_S = 15 * 60;

/** Where this job's window starts for the check from `prev` to `now`. */
export function windowFor(job: Job, prev: ClockReading | null, now: ClockReading): number {
  if (!prev || prev.dateKey !== now.dateKey || prev.seconds > now.seconds) return startWindow(now.seconds);
  if (job.when.kind === "every") return prev.seconds;
  return Math.max(prev.seconds, now.seconds - LOOKBACK_S);
}

/**
 * Jobs due between the previous check and now: (window start, now.seconds] today.
 * A job comes due at most once per check, at its latest due time in the window, so a clock jump past several
 * "every 2 hours" slots fires one reminder, not a burst.
 */
export function dueJobs(jobs: Job[], prev: ClockReading | null, now: ClockReading): DueJob[] {
  const out: DueJob[] = [];
  for (const job of jobs) {
    const from = windowFor(job, prev, now);
    const hit = jobSecondsOn(job, now.dayLabel)
      .filter((t) => t > from && t <= now.seconds)
      .pop();
    if (hit !== undefined) out.push(slot(job, now.dateKey, hit));
  }
  return out.sort((a, b) => a.seconds - b.seconds);
}

/** The latest slot of `job` at or before now, if it is at most `maxAge` seconds old. */
function latestPast(job: Job, now: ClockReading, maxAge: number): DueJob | null {
  const t = jobSecondsOn(job, now.dayLabel)
    .filter((s) => s <= now.seconds)
    .pop();
  return t !== undefined && now.seconds - t <= maxAge ? slot(job, now.dateKey, t) : null;
}

/** New job lines (keys not in `known`) whose slot was already due when they appeared, at most CATCH_UP_S old. */
export function catchUpJobs(jobs: Job[], known: ReadonlySet<string>, now: ClockReading): DueJob[] {
  return jobs
    .filter((j) => !known.has(j.key))
    .map((j) => latestPast(j, now, CATCH_UP_S))
    .filter((d): d is DueJob => d !== null);
}

/**
 * Upcoming jobs today, soonest first (strictly after now). `skip` holds fireId()s already done,
 * so "fire the next job" twice in a row moves on to the following one.
 */
export function upcomingJobs(jobs: Job[], now: ClockReading, skip?: ReadonlySet<string>): DueJob[] {
  const out: DueJob[] = [];
  for (const job of jobs) {
    for (const t of jobSecondsOn(job, now.dayLabel)) {
      if (t <= now.seconds) continue;
      const d = slot(job, now.dateKey, t);
      if (skip?.has(fireId(job.key, d.dueAt))) continue;
      out.push(d);
    }
  }
  return out.sort((a, b) => a.seconds - b.seconds);
}

export function nextJob(jobs: Job[], now: ClockReading, skip?: ReadonlySet<string>): DueJob | null {
  return upcomingJobs(jobs, now, skip)[0] ?? null;
}

/** The next due time of one job for the jobs board: later today, else tomorrow's first; null if it is done. */
export function nextSlot(job: Job, now: ClockReading, tomorrow: Omit<ClockReading, "seconds">): (DueJob & { inSeconds: number }) | null {
  const today = jobSecondsOn(job, now.dayLabel).find((t) => t > now.seconds);
  if (today !== undefined) return { ...slot(job, now.dateKey, today), inSeconds: today - now.seconds };
  const next = jobSecondsOn(job, tomorrow.dayLabel)[0];
  if (next === undefined) return null;
  return { ...slot(job, tomorrow.dateKey, next), inSeconds: 86_400 - now.seconds + next };
}

/**
 * The routine's state between checks, without timers or React (the hook drives it):
 *   setJobs(list, now)   heartbeat.md changed (live changes also catch up new lines that are already due)
 *   tick(now)            a check on the demo clock: holds every job that came due
 *   take()               the held job to fire now (only when Nani is idle and no call is open)
 *   fireNext(now, tmrw)  the presenter's "Fire next job"
 * Each due time is handed out once (fireId); the server's fire-once key stops doubles across pages.
 */
export class RoutineScheduler {
  private jobs: Job[] = [];
  private known: Set<string> | null = null; // keys of the current list, after the first load
  private prev: ClockReading | null = null;
  /** jobKey -> the slot waiting for Nani (the newest slot wins, so a held job plus +2 h fires once). heldAt: the clock
   * reading (s) when it started waiting; forced: the presenter's Fire next, never dropped as stale. */
  readonly held = new Map<string, DueJob & { heldAt: number; forced?: boolean }>();
  /** fireId()s already handed out. */
  readonly fired = new Set<string>();

  get list(): Job[] {
    return this.jobs;
  }

  /** A new jobs list. On a live change (not the first load) new lines whose slot is already due are held too. */
  setJobs(jobs: Job[], now: ClockReading | null): DueJob[] {
    this.jobs = jobs;
    const keys = new Set(jobs.map((j) => j.key));
    for (const k of [...this.held.keys()]) if (!keys.has(k)) this.held.delete(k); // a stopped job never fires
    const caught = this.known && now ? catchUpJobs(jobs, this.known, now) : [];
    for (const d of caught) this.hold(d, now!.seconds);
    this.known = keys;
    return caught;
  }

  /** One check on the demo clock. Holds every job due since the last check; drops held slots that went stale. */
  tick(now: ClockReading): DueJob[] {
    const due = dueJobs(this.jobs, this.prev, now);
    for (const d of due) this.hold(d, now.seconds);
    for (const [k, d] of this.held) {
      if (d.forced) continue;
      const stale = d.dateKey !== now.dateKey || d.seconds > now.seconds || now.seconds - d.heldAt > HOLD_MAX_S;
      if (stale) this.held.delete(k);
    }
    this.prev = now;
    return due;
  }

  private hold(d: DueJob, heldAt: number, forced = false): boolean {
    if (this.fired.has(fireId(d.job.key, d.dueAt))) return false;
    const cur = this.held.get(d.job.key);
    if (cur && cur.dateKey === d.dateKey && cur.seconds >= d.seconds) return false;
    this.held.set(d.job.key, { ...d, heldAt, ...(forced ? { forced } : {}) });
    return true;
  }

  private earliest(): DueJob | null {
    let first: DueJob | null = null;
    for (const d of this.held.values()) if (!first || d.dateKey < first.dateKey || (d.dateKey === first.dateKey && d.seconds < first.seconds)) first = d;
    return first;
  }

  /** The held job to fire now (the earliest), marked fired. Call only when Nani is free. */
  take(): DueJob | null {
    const first = this.earliest();
    if (!first) return null;
    this.held.delete(first.job.key);
    this.fired.add(fireId(first.job.key, first.dueAt));
    return { job: first.job, dueAt: first.dueAt, dateKey: first.dateKey, seconds: first.seconds };
  }

  /** The fire did not reach the server (network): forget it, so it can be sent again. With `retryAt`, hold it again now. */
  failed(d: DueJob, retryAt?: ClockReading): void {
    this.fired.delete(fireId(d.job.key, d.dueAt));
    if (retryAt) this.hold(d, retryAt.seconds, true);
  }

  /**
   * "Fire next job": a held job already goes first (it fires as soon as Nani is free). Otherwise a slot that came due in
   * the last CATCH_UP_S and never fired (the reminder that didn't fire), else the next upcoming one (today, else
   * tomorrow's first). Holds it and returns it.
   */
  fireNext(now: ClockReading, tomorrow: ClockReading): DueJob | null {
    const waiting = this.earliest();
    if (waiting) return waiting;
    const missed = this.jobs
      .map((j) => latestPast(j, now, CATCH_UP_S))
      .filter((d): d is DueJob => d !== null && !this.fired.has(fireId(d.job.key, d.dueAt)))
      .sort((a, b) => b.seconds - a.seconds)[0];
    const d = missed ?? nextJob(this.jobs, now, this.fired) ?? nextJob(this.jobs, tomorrow, this.fired);
    if (!d) return null;
    this.hold(d, now.seconds, true);
    return d;
  }
}
