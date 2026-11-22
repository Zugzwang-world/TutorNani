// Run with node --test after compiling (see the PR). Covers the PLAN C10 / REFINE R4 due-time logic, in seconds.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatJob, jobSecondsOn, jobTimesOn, parseJobLine, parseJobs, parseWhen, stampOnceDate } from "../jobs";
import { CATCH_UP_S, RoutineScheduler, catchUpJobs, dueJobs, fireId, nextJob, nextSlot, upcomingJobs, type ClockReading } from "./index";

/** A demo clock reading: "12:00" or "01:16:05". */
const at = (t: string, dateKey = "2026-11-17", dayLabel = "17 Nov"): ClockReading => {
  const [h, m, s = 0] = t.split(":").map(Number);
  return { seconds: h * 3600 + m * 60 + s, dateKey, dayLabel };
};
const D19 = ["2026-11-19", "19 Nov"] as const;
const at19 = (t: string) => at(t, ...D19);
const plus = (r: ClockReading, secs: number): ClockReading => ({ ...r, seconds: r.seconds + secs });
const md = (lines: string[]) => `# Routine\n\n## Jobs\n${lines.join("\n")}\n`;

const water = "- every 2 hours from 10:00 to 18:00 | say | Aarav beta, paani pi lo! | set by Mumma";
const brief = "- daily at 19:00 | brief | Evening brief for Mumma and Papa | set by Nani";
const once = "- once at 19:00 | call | Papa | set by Papa";
const nowWater = "- every 2 hours from 01:16:05 | say | Aarav beta, paani pi lo! Paani piya? | set by Mumma";

test("every 2 hours from 10:00 to 18:00 fires at 12:00", () => {
  const jobs = parseJobs(md([water]));
  const due = dueJobs(jobs, null, at("12:00"));
  assert.equal(due.length, 1);
  assert.equal(due[0].dueAt, "2026-11-17T12:00");
  assert.equal(dueJobs(jobs, at("11:59:59"), at("12:00")).length, 1);
  assert.equal(dueJobs(jobs, at("12:00"), at("12:00:01")).length, 0); // already past
  assert.equal(dueJobs(jobs, null, at("13:00")).length, 0); // 13:00 is not a slot
});

test("a clock jump past several slots fires only the latest", () => {
  const jobs = parseJobs(md([water]));
  const due = dueJobs(jobs, at("09:00"), at("16:30"));
  assert.deepEqual(due.map((d) => d.dueAt), ["2026-11-17T16:00"]);
});

test("daily at 19:00 fires at 19:00, once per day", () => {
  const jobs = parseJobs(md([brief]));
  assert.equal(dueJobs(jobs, null, at("19:00"))[0]?.dueAt, "2026-11-17T19:00");
  assert.equal(dueJobs(jobs, at("18:58"), at("18:59")).length, 0);
  assert.equal(dueJobs(jobs, null, at("19:00", "2026-11-18", "18 Nov"))[0]?.dueAt, "2026-11-18T19:00");
});

test("once at 19:00, and once on a date", () => {
  const jobs = parseJobs(md([once, "- once on 18 Nov at 09:00 | song | Play it | set by Mumma"]));
  assert.equal(jobs.length, 2);
  assert.equal(dueJobs(jobs, null, at("19:00")).length, 1);
  assert.equal(dueJobs(jobs, null, at("09:00")).length, 0); // wrong date
  assert.equal(dueJobs(jobs, null, at("09:00", "2026-11-18", "18 Nov")).length, 1);
});

test("next upcoming job, and skipping fires already done", () => {
  const jobs = parseJobs(md([water, brief]));
  const now = at("12:30");
  assert.equal(nextJob(jobs, now)?.dueAt, "2026-11-17T14:00");
  const skip = new Set([fireId(jobs[0].key, "2026-11-17T14:00")]);
  assert.equal(nextJob(jobs, now, skip)?.dueAt, "2026-11-17T16:00");
  assert.equal(nextJob(jobs, at("19:30")), null);
  assert.equal(upcomingJobs(jobs, at("12:00")).length, 4); // 14, 16, 18, 19:00; 12:00 itself is not upcoming
});

test("clock jumps: forward catches skips (daily jobs only the last 30 min); backward and the first check only now", () => {
  const jobs = parseJobs(md([water, brief]));
  // +30 min from 11:50 to 12:20 catches the 12:00 water slot
  assert.deepEqual(dueJobs(jobs, at("11:50"), at("12:20")).map((d) => d.dueAt), ["2026-11-17T12:00"]);
  // +2 h from 17:20 to 19:20: the water reminder's 18:00 slot (it skipped it) and the brief (20 min ago)
  assert.deepEqual(dueJobs(jobs, at("17:20"), at("19:20")).map((d) => d.job.action), ["say", "brief"]);
  // +2 h from 17:45 to 19:45: the brief is 45 min old, so it is stale
  assert.deepEqual(dueJobs(jobs, at("17:45"), at("19:45")).map((d) => d.job.action), ["say"]);
  // a backward jump (Real time) fires only a slot due this very second
  assert.equal(dueJobs(jobs, at("20:30"), at("12:00:01")).length, 0);
  assert.deepEqual(dueJobs(jobs, at("20:30"), at("12:00")).map((d) => d.dueAt), ["2026-11-17T12:00"]);
  // the first check
  assert.equal(dueJobs(jobs, null, at("19:30")).length, 0);
});

// ---------- REFINE R4.3: firing in seconds, catching up a "now" job, the idle hold, +2 h ----------

test("firing in seconds: a slot at 01:16:05 fires in the check that crosses it, not before, once", () => {
  const jobs = parseJobs(md([nowWater]));
  assert.equal(dueJobs(jobs, at19("01:16:03"), at19("01:16:04")).length, 0);
  const due = dueJobs(jobs, at19("01:16:04"), at19("01:16:05"));
  assert.equal(due.length, 1);
  assert.equal(due[0].seconds, 4565);
  assert.equal(due[0].dueAt, "2026-11-19T01:16");
  assert.equal(dueJobs(jobs, at19("01:16:05"), at19("01:16:06")).length, 0);
  const s = new RoutineScheduler();
  s.setJobs(jobs, at19("01:16:00"));
  s.tick(at19("01:16:04"));
  assert.equal(s.take(), null);
  s.tick(at19("01:16:05"));
  assert.equal(s.take()?.dueAt, "2026-11-19T01:16");
  s.tick(at19("01:16:06"));
  assert.equal(s.take(), null);
});

test('a one-off with seconds ("call him in 2 minutes") fires at its second, once', () => {
  const s = new RoutineScheduler();
  s.setJobs([], at19("01:16:05"));
  s.tick(at19("01:16:05"));
  s.setJobs(parseJobs(md(["- once on 19 Nov at 01:18:05 | call | Mumma | set by Mumma"])), at19("01:16:09"));
  assert.equal(s.take(), null); // not due yet: nothing to catch up
  for (let t = at19("01:16:10"); t.seconds < 4685; t = plus(t, 1)) {
    s.tick(t);
    assert.equal(s.take(), null);
  }
  s.tick(at19("01:18:05"));
  assert.equal(s.take()?.job.action, "call");
  for (let t = at19("01:18:06"); t.seconds < 4800; t = plus(t, 1)) s.tick(t);
  assert.equal(s.take(), null); // it rings once
});

test('catch-up: a new "now" line seen a few seconds late still fires, once', () => {
  const jobs = parseJobs(md([nowWater]));
  // the window alone misses it: the page sees the line at 01:16:09, after its 01:16:05 slot
  assert.equal(dueJobs(jobs, at19("01:16:08"), at19("01:16:09")).length, 0);
  assert.equal(catchUpJobs(jobs, new Set(), at19("01:16:09"))[0]?.dueAt, "2026-11-19T01:16");
  const s = new RoutineScheduler();
  s.setJobs(parseJobs(md([brief])), at19("01:15:00")); // the first load
  s.tick(at19("01:16:08"));
  const caught = s.setJobs(parseJobs(md([brief, nowWater])), at19("01:16:09")); // the live change
  assert.equal(caught.length, 1);
  assert.equal(s.take()?.dueAt, "2026-11-19T01:16");
  s.tick(at19("01:16:09"));
  s.tick(at19("01:16:10"));
  s.setJobs(parseJobs(md([brief, nowWater, "- daily at 20:30 | say | Kahani time! | set by Papa"])), at19("01:16:30"));
  assert.equal(s.take(), null); // an unrelated edit later does not replay it
});

test("catch-up: never on the first load, never past CATCH_UP_S", () => {
  const jobs = parseJobs(md([nowWater]));
  const s = new RoutineScheduler();
  assert.equal(s.setJobs(jobs, at19("01:16:09")).length, 0); // the first load: a reload never replays it
  assert.equal(s.take(), null);
  const old = new RoutineScheduler();
  old.setJobs([], at19("01:16:00"));
  assert.equal(old.setJobs(jobs, plus(at19("01:16:05"), CATCH_UP_S + 1)).length, 0);
  assert.equal(old.setJobs([], at19("01:18:30")).length, 0);
  assert.equal(old.setJobs(jobs, plus(at19("01:16:05"), CATCH_UP_S)).length, 1); // exactly 2 min old: still fires
});

test("idle hold: a job due while Nani is busy waits, then fires once when she is free", () => {
  const s = new RoutineScheduler();
  s.setJobs(parseJobs(md([nowWater])), at19("01:16:00"));
  // Nani talks from 01:16:00 to 01:17:30: the hook ticks every second but calls take() only when she is idle
  for (let t = at19("01:16:00"); t.seconds <= at19("01:17:30").seconds; t = plus(t, 1)) {
    s.tick(t);
    assert.equal(s.held.size, t.seconds >= 4565 ? 1 : 0);
  }
  assert.equal(s.take()?.dueAt, "2026-11-19T01:16"); // she went idle at 01:17:30
  s.tick(at19("01:17:31"));
  assert.equal(s.take(), null);
  assert.equal(s.held.size, 0);
});

test("idle hold: a stopped job is dropped at once; a job held past HOLD_MAX_S is dropped", () => {
  const s = new RoutineScheduler();
  s.setJobs(parseJobs(md([nowWater])), at19("01:16:00"));
  s.tick(at19("01:16:05"));
  assert.equal(s.held.size, 1);
  s.setJobs(parseJobs(md([brief])), at19("01:16:20")); // "Stop the water reminder"
  assert.equal(s.held.size, 0);
  const t = new RoutineScheduler();
  t.setJobs(parseJobs(md([nowWater])), at19("01:16:00"));
  for (let r = at19("01:16:00"); r.seconds <= at19("01:32:00").seconds; r = plus(r, 5)) t.tick(r);
  assert.equal(t.take(), null);
});

test("+2 h fires the slot it skipped exactly once, never a burst", () => {
  const s = new RoutineScheduler();
  s.setJobs(parseJobs(md([brief, nowWater])), at19("01:16:00"));
  s.tick(at19("01:16:05"));
  assert.equal(s.take()?.dueAt, "2026-11-19T01:16");
  for (let t = at19("01:16:06"); t.seconds <= at19("01:19:00").seconds; t = plus(t, 1)) s.tick(t);
  assert.equal(s.take(), null);
  // +2 h at 01:19:00 -> 03:19:00: the 03:16:05 slot, once
  s.tick(at19("03:19:00"));
  assert.equal(s.take()?.dueAt, "2026-11-19T03:16");
  assert.equal(s.take(), null);
  for (let t = at19("03:19:01"); t.seconds <= at19("03:22:00").seconds; t = plus(t, 1)) s.tick(t);
  assert.equal(s.take(), null);
  // waited 50 min before pressing +2 h: still fires (repeating jobs reach back over the whole jump)
  s.tick(at19("04:06:00"));
  s.tick(at19("06:06:00"));
  assert.deepEqual([s.take()?.dueAt, s.take()], ["2026-11-19T05:16", null]);
  // Real time, then +2 h again over a slot that already fired: nothing
  s.tick(at19("01:30:00"));
  s.tick(at19("03:30:00"));
  assert.equal(s.take(), null);
});

test("a held slot plus +2 h collapses to one fire (the newest)", () => {
  const s = new RoutineScheduler();
  s.setJobs(parseJobs(md([nowWater])), at19("01:16:00"));
  s.tick(at19("01:16:05")); // due, but Nani is talking
  s.tick(at19("03:16:10")); // the presenter presses +2 h meanwhile
  assert.equal(s.held.size, 1);
  assert.equal(s.take()?.dueAt, "2026-11-19T03:16");
  assert.equal(s.take(), null);
});

test("fire next prefers a just-missed slot, then the next upcoming, then tomorrow's first", () => {
  const tomorrow = { seconds: -1, dateKey: "2026-11-20", dayLabel: "20 Nov" };
  const s = new RoutineScheduler();
  s.setJobs(parseJobs(md([brief, nowWater])), at19("01:17:00")); // a reload just after the "now" reminder: it never fired here
  s.tick(at19("01:17:00"));
  assert.equal(s.fireNext(at19("01:17:00"), tomorrow)?.dueAt, "2026-11-19T01:16"); // not the 03:16 slot
  assert.equal(s.take()?.dueAt, "2026-11-19T01:16");
  assert.equal(s.fireNext(at19("01:17:30"), tomorrow)?.dueAt, "2026-11-19T03:16");
  s.tick(at19("01:17:31")); // a forced future slot is not dropped as stale before it is taken
  assert.equal(s.take()?.dueAt, "2026-11-19T03:16");
  // +2 h later: 03:16 already fired, so nothing plays twice
  s.tick(at19("03:17:31"));
  assert.equal(s.take(), null);
  const late = new RoutineScheduler();
  late.setJobs(parseJobs(md([brief])), at19("23:00"));
  assert.equal(late.fireNext(at19("23:00"), tomorrow)?.dueAt, "2026-11-20T19:00");
  late.tick(at19("23:00:01"));
  assert.equal(late.take()?.dueAt, "2026-11-20T19:00");
});

test("the jobs board: next due time and countdown, rolling over to tomorrow", () => {
  const job = parseJobs(md([nowWater]))[0];
  const tomorrow = { dateKey: "2026-11-20", dayLabel: "20 Nov" };
  const n = nextSlot(job, at19("01:16:06"), tomorrow)!;
  assert.equal(n.dueAt, "2026-11-19T03:16");
  assert.equal(n.inSeconds, 2 * 3600 - 1);
  const t = nextSlot(job, at19("23:20:00"), tomorrow)!;
  assert.equal(t.dateKey, "2026-11-20");
  assert.equal(t.inSeconds, 40 * 60 + 3600 + 16 * 60 + 5);
  const call = parseJobs(md(["- once on 19 Nov at 01:18:05 | call | Mumma | set by Mumma"]))[0];
  assert.equal(nextSlot(call, at19("01:17:05"), tomorrow)?.inSeconds, 60);
  assert.equal(nextSlot(call, at19("01:19"), tomorrow), null);
});

// ---------- REFINE R4.1: job lines with no end, seconds, and dated one-offs ----------

test("every 2 hours from HH:MM:SS has no end: due at the start, then every 2 hours to the end of the day", () => {
  const w = parseWhen("every 2 hours from 01:16:05");
  assert.deepEqual(w, { kind: "every", everyMinutes: 120, from: "01:16:05" });
  const job = parseJobLine("- every 2 hours from 01:16:05 | say | Aarav beta, paani pi lo! | set by Mumma")!;
  const secs = jobSecondsOn(job, "19 Nov");
  assert.equal(secs[0], 1 * 3600 + 16 * 60 + 5);
  assert.equal(secs[1], 3 * 3600 + 16 * 60 + 5);
  assert.equal(secs.at(-1), 23 * 3600 + 16 * 60 + 5);
  assert.equal(secs.length, 12);
  assert.deepEqual(jobTimesOn(job, "19 Nov").slice(0, 2), [76, 196]);
});

test("every N minutes from HH:MM with no end, and the old window form still parse", () => {
  assert.deepEqual(parseWhen("every 30 minutes from 7:05"), { kind: "every", everyMinutes: 30, from: "07:05" });
  assert.deepEqual(parseWhen("every 2 hours from 10:00 to 18:00"), { kind: "every", everyMinutes: 120, from: "10:00", to: "18:00" });
  assert.deepEqual(parseWhen("daily at 19:00"), { kind: "daily", at: "19:00" });
  assert.equal(parseWhen("every 0 minutes from 10:00"), null);
  assert.equal(parseWhen("every 2 hours from 25:00"), null);
});

test("seconds in one-off times", () => {
  assert.deepEqual(parseWhen("once on 19 Nov at 01:16:35"), { kind: "once", at: "01:16:35", date: "19 Nov" });
  const job = parseJobLine("- once on 19 Nov at 01:18:00 | call | Papa | set by Papa")!;
  assert.deepEqual(jobSecondsOn(job, "19 Nov"), [4680]);
  assert.deepEqual(jobSecondsOn(job, "20 Nov"), []);
  assert.equal(parseWhen("once on 19 Nov at 01:16:60"), null);
});

test("formatJob round-trips every form", () => {
  for (const line of [
    "- every 2 hours from 01:16:05 | say | Paani pi lo! | set by Mumma",
    "- every 45 minutes from 09:00 | say | Stretch! | set by Papa",
    "- every 2 hours from 10:00 to 18:00 | say | Paani pi lo! | set by Mumma",
    "- once on 19 Nov at 01:18:00 | call | Papa | set by Papa",
    "- once at 19:00 | call | Papa | set by Papa",
    "- daily at 20:30 | say | Good night! | set by Nani",
  ]) {
    assert.equal(formatJob(parseJobLine(line)!), line);
  }
});

test("a dateless one-off gets today's date stamped; other lines are unchanged", () => {
  assert.equal(stampOnceDate("- once at 19:00 | call | Papa | set by Mumma", "19 Nov"), "- once on 19 Nov at 19:00 | call | Papa | set by Mumma");
  assert.equal(stampOnceDate("- once at 7:05:30 | say | Hi | set by Papa", "19 Nov"), "- once on 19 Nov at 07:05:30 | say | Hi | set by Papa");
  for (const l of ["- once on 20 Nov at 19:00 | call | Papa | set by Mumma", "- daily at 19:00 | brief | Brief | set by Nani", "- every 2 hours from 01:00 | say | x | set by Mumma"]) {
    assert.equal(stampOnceDate(l, "19 Nov"), l);
  }
});
