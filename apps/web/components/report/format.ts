// Small date and word helpers for the report (India time). Pure.
import type { ProgressArea, ProgressFeeling } from "@/lib/types";
import type { ReportData } from "./types";

const TZ = "Asia/Kolkata";
const utc = (day: string) => new Date(`${day}T12:00:00Z`);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 14 Nov" */
export function dayShort(day: string): string {
  const d = utc(day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "14 November" (with the year dropped) */
function dayLong(day: string, withMonth = true): string {
  return utc(day).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", ...(withMonth ? { month: "long" } : {}) });
}

/** The line under the title: what this period covers. */
export function periodLabel(r: Pick<ReportData, "view" | "from" | "to">): string {
  if (r.view === "today") {
    return `${utc(r.to).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}, filling in live`;
  }
  if (r.view === "all") return `Since ${dayLong(r.from)}`;
  const sameMonth = r.from.slice(0, 7) === r.to.slice(0, 7);
  return `${dayLong(r.from, !sameMonth)} to ${dayLong(r.to)}`;
}

/** "Thu 19 Nov at 5:42 pm" from an ISO time, India time. */
export function whenSaid(iso: string): string {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.weekday} ${p.day} ${p.month} at ${p.hour}:${p.minute} ${(p.dayPeriod ?? "").toLowerCase()}`;
}

/** "5:42 pm" from "17:42". */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export const PERIOD_WORD: Record<ReportData["view"], string> = { today: "today", week: "this week", month: "this month", all: "so far" };

export const AREA: Record<ProgressArea, { name: string; what: string; color: string; deep: string }> = {
  language: { name: "Language and letters", what: "Words, letters, sounds", color: "#f6a623", deep: "#b25b00" },
  numbers: { name: "Numbers and thinking", what: "Counting, colours, shapes", color: "#7fa6e0", deep: "#2f5fa8" },
  feelings: { name: "Feelings and manners", what: "Sharing, thank you, water", color: "#ec7fa3", deep: "#b02a5b" },
  culture: { name: "Songs and culture", what: "Songs, rhymes, festivals", color: "#7dbb6a", deep: "#3c7a2c" },
};

export function weatherOf(f: ProgressFeeling): { emoji: string; label: string } {
  if (f === "happy" || f === "excited") return { emoji: "☀️", label: f === "happy" ? "Happy" : "Excited" };
  if (f === "calm" || f === "tired") return { emoji: "⛅", label: f === "calm" ? "Calm" : "Tired" };
  return { emoji: "🌧️", label: f === "upset" ? "Upset" : f === "scared" ? "Scared" : "Sad" };
}

/** A stable small number from a word (plant heights, sides). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const HINDI_NUMBERS = ["ek", "do", "teen", "chaar", "paanch", "chhah", "saat", "aath", "nau", "das"];
