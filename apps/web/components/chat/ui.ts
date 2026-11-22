// Small client helpers for the guidance chat: colour classes, India-time labels, ids.
import { clockParts } from "@/lib/clock";
import { config } from "@/lib/config";
import { BOTS, type BotInfo, type BotKey } from "@/lib/types";

// Literal class names so Tailwind sees every one of them.
export interface Tone {
  text: string; // readable name colour
  soft: string; // soft background
  solid: string; // solid background (dots, accents)
  border: string;
}

export const TONES: Record<string, Tone> = {
  marigold: { text: "text-[#b86a00]", soft: "bg-marigold-soft", solid: "bg-marigold", border: "border-marigold" },
  routine: { text: "text-routine", soft: "bg-routine-soft", solid: "bg-routine", border: "border-routine" },
  rules: { text: "text-rules", soft: "bg-rules-soft", solid: "bg-rules", border: "border-rules" },
  lessons: { text: "text-lessons", soft: "bg-lessons-soft", solid: "bg-lessons", border: "border-lessons" },
  memory: { text: "text-memory", soft: "bg-memory-soft", solid: "bg-memory", border: "border-memory" },
};

export function toneOf(bot: BotInfo): Tone {
  return TONES[bot.color] ?? TONES.marigold;
}

export function botOf(sender: string): BotInfo | null {
  return (BOTS as Record<string, BotInfo>)[sender] ?? null;
}

export function isBotKey(x: unknown): x is BotKey {
  return typeof x === "string" && x in BOTS;
}

export const CHAT_TITLE = `${config.childName}'s ${config.grandmaName}`;

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: config.timezone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: config.timezone,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "9:30 am", India time. */
export function timeLabel(iso: string): string {
  return timeFmt.format(new Date(iso)).replace(/\s*([ap])\.?m\.?/i, (_, a: string) => ` ${a.toLowerCase()}m`);
}

/** "2026-11-16", India date. */
export function dayKey(iso: string): string {
  return clockParts(new Date(iso)).dateKey;
}

/** "Today", "Yesterday" or "Sun 16 Nov". Call only in the browser (reads the current time). */
export function dayLabel(iso: string): string {
  const k = dayKey(iso);
  const now = Date.now();
  if (k === clockParts(new Date(now)).dateKey) return "Today";
  if (k === clockParts(new Date(now - 86_400_000)).dateKey) return "Yesterday";
  return dayFmt.format(new Date(iso)).replace(",", "");
}

/** "Mon 16 Nov · 9:30 am". */
export function whenLabel(iso: string): string {
  return `${dayFmt.format(new Date(iso)).replace(",", "")} · ${timeLabel(iso)}`;
}

/** Random id; works on plain http too (no secure-context requirement). */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* not a secure context */
    }
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function readSender(): string | null {
  try {
    return localStorage.getItem("tg_sender");
  } catch {
    return null;
  }
}

export function saveSender(name: string): void {
  try {
    localStorage.setItem("tg_sender", name);
  } catch {
    /* private mode: keep it for this visit only */
  }
}
