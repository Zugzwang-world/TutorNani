// What GET /api/progress?view= returns (REFINE R7). Pure types, shared by the route and the report.
import type { ProgressArea, ProgressFeeling } from "@/lib/types";

export type ReportView = "today" | "week" | "month" | "all";
export const REPORT_VIEWS: ReportView[] = ["today", "week", "month", "all"];
export const VIEW_LABEL: Record<ReportView, string> = { today: "Today", week: "This week", month: "This month", all: "All time" };

export interface ReportWord {
  en: string;
  hi?: string;
  emoji: string;
  area: ProgressArea;
  quote?: string; // his own words when he first said it
  firstSaid?: string; // ISO time
  isNew: boolean; // first said inside this period
}

export interface ReportMoment {
  day: string; // "2026-11-19"
  time: string; // "HH:MM"
  feeling: ProgressFeeling;
  what: string;
  helped?: string;
}

export interface ReportDay {
  day: string;
  played: boolean;
  newWords: number;
  summary?: string[];
  live?: boolean; // today, still filling in
}

export interface ReportData {
  view: ReportView;
  childName: string;
  grandmaName: string;
  today: string; // "2026-11-19" (India)
  from: string;
  to: string;
  quiet: boolean; // no play in this period
  pending: boolean; // today's three lines, feelings and starters are still being written
  summary: string[];
  starters: string[];
  words: ReportWord[];
  letters: { learnt: string[]; fresh: string[]; current: string | null };
  counting: { upTo: number; inPeriod: number };
  areas: Record<ProgressArea, number>;
  days: ReportDay[]; // every day from the first one to today (the calendar)
  moods: ReportMoment[];
  tricky: { what: string; tip: string }[];
  routine: { water: { asked: number; done: number }; calls: number; stories: number };
  highlights: { day: string; text: string; quote?: string }[];
  playDays: number;
}
