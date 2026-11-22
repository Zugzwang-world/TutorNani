// heartbeat.md job lines (PLAN.md D5, REFINE R4.1). Pure; safe on client and server.
// Format: - <when> | <action> | <text> | set by <who>
// <when> is one of:
//   daily at HH:MM[:SS]
//   every N minutes|hours from HH:MM[:SS] to HH:MM[:SS]   (a window, every day)
//   every N minutes|hours from HH:MM[:SS]                  (no end: due at the start, then every N, every day, until removed)
//   once on DD Mon at HH:MM[:SS]                           (one day only)
//   once at HH:MM[:SS]                                     (old form, no date: today only; the chat route stamps today's date on new lines)
import { sectionLines } from "./files-pure";
import type { Job, JobAction, JobWhen } from "./types";

const ACTIONS: JobAction[] = ["say", "call", "brief", "song"];
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const T = "(\\d{1,2}:\\d{2}(?::\\d{2})?)";

/** "7:05" -> "07:05", "7:05:09" -> "07:05:09". Seconds are kept only when written. */
function pad(t: string): string {
  const m = t.match(TIME);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}${m[3] !== undefined ? `:${m[3]}` : ""}` : t;
}
const isTime = (t: string) => TIME.test(t);

export function parseWhen(s: string): JobWhen | null {
  const w = s.trim().toLowerCase();
  let m = w.match(new RegExp(`^daily at ${T}$`));
  if (m && isTime(m[1])) return { kind: "daily", at: pad(m[1]) };
  m = w.match(new RegExp(`^every (\\d+) (hours?|hrs?|minutes?|mins?) from ${T}(?: to ${T})?$`));
  if (m && isTime(m[3]) && (m[4] === undefined || isTime(m[4]))) {
    const n = parseInt(m[1], 10);
    const everyMinutes = m[2].startsWith("h") ? n * 60 : n;
    if (everyMinutes < 1) return null;
    return m[4] === undefined
      ? { kind: "every", everyMinutes, from: pad(m[3]) }
      : { kind: "every", everyMinutes, from: pad(m[3]), to: pad(m[4]) };
  }
  m = w.match(new RegExp(`^once on (\\d{1,2} [a-z]{3}) at ${T}$`));
  if (m && isTime(m[2])) {
    const [d, mon] = m[1].split(" ");
    return { kind: "once", at: pad(m[2]), date: `${parseInt(d, 10)} ${mon[0].toUpperCase()}${mon.slice(1)}` };
  }
  m = w.match(new RegExp(`^once at ${T}$`));
  if (m && isTime(m[1])) return { kind: "once", at: pad(m[1]) };
  return null;
}

/**
 * Gives a dateless one-off line today's date ("- once at 19:00 | …" -> "- once on 19 Nov at 19:00 | …"),
 * so "once at HH:MM" means today only. Other lines come back unchanged.
 */
export function stampOnceDate(line: string, dayLabel: string): string {
  return line.replace(/^(\s*-\s*)once at (\d{1,2}:\d{2}(?::\d{2})?)(\s*\|)/i, (_, a, t, b) => `${a}once on ${dayLabel} at ${pad(t)}${b}`);
}

/** Stable key for a job line: survives re-saves of the file as long as the line is unchanged. */
export function jobKey(raw: string): string {
  const s = raw.replace(/^-\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `job_${h.toString(36)}`;
}

export function parseJobLine(line: string): Job | null {
  const raw = line.trim();
  if (!raw.startsWith("-")) return null;
  const parts = raw.replace(/^-\s*/, "").split("|").map((p) => p.trim());
  if (parts.length < 3) return null;
  const when = parseWhen(parts[0]);
  const action = parts[1].toLowerCase() as JobAction;
  if (!when || !ACTIONS.includes(action)) return null;
  const setBy = (parts[3] || "").replace(/^set by\s*/i, "").trim() || "Nani";
  return { key: jobKey(raw), raw, when, action, text: parts[2], setBy };
}

/** All valid jobs under "## Jobs" in heartbeat.md. Invalid lines are skipped. */
export function parseJobs(heartbeatMd: string): Job[] {
  return sectionLines(heartbeatMd, "## Jobs")
    .map(parseJobLine)
    .filter((j): j is Job => j !== null);
}

export function formatJob(j: Pick<Job, "when" | "action" | "text" | "setBy">): string {
  const w = j.when;
  const every = (n: number) => (n % 60 === 0 ? `every ${n / 60} hours` : `every ${n} minutes`);
  const when =
    w.kind === "daily"
      ? `daily at ${w.at}`
      : w.kind === "every"
        ? `${every(w.everyMinutes)} from ${w.from}${w.to ? ` to ${w.to}` : ""}`
        : w.date
          ? `once on ${w.date} at ${w.at}`
          : `once at ${w.at}`;
  return `- ${when} | ${j.action} | ${j.text} | set by ${j.setBy}`;
}

/** "HH:MM" or "HH:MM:SS" -> minutes after midnight (seconds dropped). */
export const toMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
/** "HH:MM" or "HH:MM:SS" -> seconds after midnight. */
export const toSeconds = (t: string): number => {
  const [h, m, sec = 0] = t.split(":").map(Number);
  return h * 3600 + m * 60 + sec;
};
export const fromMinutes = (n: number): string =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
/** Seconds after midnight -> "HH:MM:SS". */
export const fromSeconds = (n: number): string =>
  `${String(Math.floor(n / 3600)).padStart(2, "0")}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

const END_OF_DAY_S = 24 * 3600 - 1;

/**
 * Due times (seconds after midnight) for a job on a given day, ascending.
 * `dayLabel` is like "17 Nov" (for "once on" jobs). An "every" job with no end runs to the end of the day.
 */
export function jobSecondsOn(job: Job, dayLabel: string): number[] {
  const w = job.when;
  if (w.kind === "daily") return [toSeconds(w.at)];
  if (w.kind === "once") return !w.date || w.date.toLowerCase() === dayLabel.toLowerCase() ? [toSeconds(w.at)] : [];
  const out: number[] = [];
  const end = w.to ? toSeconds(w.to) : END_OF_DAY_S;
  for (let t = toSeconds(w.from); t <= end; t += w.everyMinutes * 60) out.push(t);
  return out;
}

/** Due times in minutes after midnight (old callers). Seconds are dropped. */
export function jobTimesOn(job: Job, dayLabel: string): number[] {
  return [...new Set(jobSecondsOn(job, dayLabel).map((s) => Math.floor(s / 60)))];
}

/** One-line human summary of the jobs, for the brain prompt (C3 step 5). */
export function summarizeJobs(jobs: Job[]): string {
  if (!jobs.length) return "No routine jobs.";
  return jobs.map((j) => formatJob(j).replace(/^- /, "")).join("\n");
}
