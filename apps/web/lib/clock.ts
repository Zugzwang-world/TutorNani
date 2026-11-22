// Demo clock: real India time plus the presenter's offset (PLAN.md C10). Pure; safe on client and server.
import { config } from "./config";

export const TZ: string = config.timezone; // "Asia/Kolkata"

export interface ClockParts {
  hhmm: string; // "12:00"
  minutes: number; // minutes after midnight, India time
  dayLabel: string; // "17 Nov"
  dateKey: string; // "2026-11-17"
  label: string; // "Tue 17 Nov, 12:00"
}

export function clockParts(d: Date): ClockParts {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  const mm = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hhmm = `${p.hour}:${p.minute}`;
  return {
    hhmm,
    minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10),
    dayLabel: `${parseInt(p.day, 10)} ${p.month}`,
    dateKey: mm,
    label: `${p.weekday} ${parseInt(p.day, 10)} ${p.month}, ${hhmm}`,
  };
}

/** The demo's "now" as a Date, given the presenter offset in ms. */
export function demoNow(offsetMs: number): Date {
  return new Date(Date.now() + (offsetMs || 0));
}

/** Offset (ms) that makes the demo clock read `hhmm` today, India time. */
export function offsetToJumpTo(hhmm: string, currentOffsetMs: number): number {
  const now = demoNow(currentOffsetMs);
  const cur = clockParts(now).minutes;
  const [h, m] = hhmm.split(":").map(Number);
  const target = h * 60 + m;
  const secs = now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();
  return currentOffsetMs + (target - cur) * 60_000 - secs;
}
