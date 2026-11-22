"use client";
// R4.5 jobs board: the demo clock, then each routine job as a card with its icon, text, who set it, the next due time and
// a live hh:mm:ss countdown on the demo clock, so a +2 h skip visibly jumps. A fired job flashes "✓ fired at 03:16".
// Data comes from this page's routine (useRoutineBoard): the same jobs, clock and fires the toy acts on. The 1 s ticker
// lives here, so only the band re-renders every second.
import { useEffect, useState } from "react";
import { clockParts } from "@/lib/clock";
import { nextSlot, type ClockReading } from "@/lib/routine";
import type { Job } from "@/lib/types";
import { useRoutineBoard } from "../toy/use-routine";

const MAX_CARDS = 3;
const FLASH_MS = 4500;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
const countdown = (s: number) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;

function iconOf(job: Job): string {
  if (job.action === "call") return "📞";
  if (job.action === "brief") return "📝";
  if (job.action === "song") return "🎵";
  const t = job.text.toLowerCase();
  if (/paani|pani|water/.test(t)) return "💧";
  if (/kahani|story/.test(t)) return "📖";
  if (/good night|so ja|sleep|neend/.test(t)) return "🌙";
  if (/brush|daant|teeth/.test(t)) return "🪥";
  if (/khana|snack|lunch|dinner|fruit|eat/.test(t)) return "🍽️";
  return "🔔";
}

/** "every 2 h", "daily", "once". */
function ruleOf(job: Job): string {
  const w = job.when;
  if (w.kind === "daily") return "daily";
  if (w.kind === "once") return "once";
  return w.everyMinutes % 60 === 0 ? `every ${w.everyMinutes / 60} h` : `every ${w.everyMinutes} min`;
}

function shiftLabel(offsetMs: number): string {
  const m = Math.round(offsetMs / 60_000);
  if (m === 0) return "";
  const a = Math.abs(m);
  const h = Math.floor(a / 60);
  const r = a % 60;
  return `${m > 0 ? "+" : "−"}${h ? `${h} h` : ""}${h && r ? " " : ""}${r ? `${r} min` : ""}`;
}

export function JobsBoard() {
  const b = useRoutineBoard();
  const [nowMs, setNowMs] = useState<number | null>(null); // null on the server render: no Date.now() while prerendering

  // Tick on each second boundary, so the clock and the countdowns turn over together.
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNowMs(Date.now());
      id = setTimeout(tick, 1000 - (Date.now() % 1000) + 8);
    };
    tick();
    return () => clearTimeout(id);
  }, []);

  const d = nowMs === null ? null : new Date(nowMs + b.offsetMs);
  const parts = d ? clockParts(d) : null;
  const now: ClockReading | null = d && parts ? { seconds: parts.minutes * 60 + d.getUTCSeconds(), dateKey: parts.dateKey, dayLabel: parts.dayLabel } : null;
  const tmrw = d ? clockParts(new Date(d.getTime() + DAY_MS)) : null;
  const shift = shiftLabel(b.offsetMs);

  // The newest line first (the job a parent just set leads); finished one-offs go last.
  const tomorrow = tmrw ? { dateKey: tmrw.dateKey, dayLabel: tmrw.dayLabel } : null;
  const isDone = (j: Job) => !!now && !!tomorrow && !nextSlot(j, now, tomorrow) && !b.held[j.key] && b.firing !== j.key;
  const newest = [...b.jobs].reverse();
  const jobs = [...newest.filter((j) => !isDone(j)), ...newest.filter(isDone)];
  const shown = jobs.slice(0, MAX_CARDS);
  const more = jobs.length - shown.length;

  return (
    <div className="tb-board">
      <div className="tb-clock" aria-label="The demo clock">
        <b className="tb-clock-time" suppressHydrationWarning>
          {parts && d ? `${parts.hhmm}:${pad(d.getUTCSeconds())}` : "--:--:--"}
        </b>
        <span className="tb-clock-day" suppressHydrationWarning>
          {parts ? parts.label.replace(/, \d\d:\d\d$/, "") : ""}
          {shift && <span className="tb-clock-shift">{shift}</span>}
        </span>
      </div>

      <div className="tb-jobs" role="list" aria-label="Routine jobs">
        {b.loaded && jobs.length === 0 && <span className="tb-empty">No routine jobs yet</span>}
        {shown.map((job) => {
          const fired = b.fired[job.key];
          const flash = fired && nowMs !== null && nowMs - fired.at < FLASH_MS;
          const firing = b.firing === job.key;
          const held = !!b.held[job.key];
          const next = now && tomorrow ? nextSlot(job, now, tomorrow) : null;
          const state = flash ? "fired" : firing ? "firing" : held ? "held" : next ? "next" : "done";
          return (
            <div key={job.key} className="tb-job" role="listitem" data-state={state} title={job.raw}>
              <span className="tb-job-icon emoji" aria-hidden>
                {iconOf(job)}
              </span>
              <span className="tb-job-main">
                <span className="tb-job-text">{job.text}</span>
                <span className="tb-job-line">
                  {state === "fired" ? (
                    <b className="tb-job-big">✓ fired at {fired!.hhmm}</b>
                  ) : state === "firing" ? (
                    <b className="tb-job-big">Now</b>
                  ) : state === "held" ? (
                    <b className="tb-job-big">Due now</b>
                  ) : next ? (
                    <b className="tb-job-big tb-num">{countdown(next.inSeconds)}</b>
                  ) : (
                    <b className="tb-job-big tb-job-done">done ✓</b>
                  )}
                  <span className="tb-job-at">
                    {state === "held"
                      ? "waiting for Nani"
                      : `${state === "next" && next ? `${next.dateKey === now!.dateKey ? "next" : "tmrw"} ${next.dueAt.slice(11, 16)} · ` : ""}${job.setBy} · ${ruleOf(job)}`}
                  </span>
                </span>
              </span>
            </div>
          );
        })}
        {more > 0 && <span className="tb-more">+{more}</span>}
      </div>
    </div>
  );
}
