"use client";
// One "typing…" bubble at a time, in the order agents will reply. Presentation only: it reads `working` and `rows`
// and never delays a real message.
import { useEffect, useRef, useState } from "react";
import { BOT_KEYS, type BotKey } from "@/lib/types";
import type { Row } from "./use-chat";

const BEAT_MS = 300; // pause between one reply landing and the next agent starting to type
const HOLD_MS = 500; // a typer that left `working` stays put this long, in case its message is a moment behind
const OUT_MS = 240; // then it fades out

export interface TypingSlot {
  bot: BotKey;
  n: number; // one per typing turn
  afterId: number; // newest row id when it started; a newer row from this bot means its reply landed
  since: number; // when it started (ms)
  phase: "on" | "hold" | "out";
}

/** All five at once means the sorter is still reading the message: the header shows it, the list does not. */
export const isReading = (working: BotKey[]) => working.length >= BOT_KEYS.length;

/** `working` in reply order. Memory waits for Lessons on the server, so Lessons goes first. */
export function replyOrder(working: BotKey[]): BotKey[] {
  if (isReading(working)) return [];
  const i = working.indexOf("memory");
  const j = working.indexOf("lessons");
  if (i >= 0 && j > i) {
    const next = working.slice();
    next.splice(j, 1);
    next.splice(i, 0, "lessons");
    return next;
  }
  return working;
}

const landed = (s: TypingSlot, rows: Row[]) => {
  for (let k = rows.length - 1; k >= 0 && rows[k].id > s.afterId; k--) if (rows[k].sender === s.bot) return rows[k].id;
  return null;
};

export function useTyping(working: BotKey[], rows: Row[]) {
  const next = replyOrder(working)[0] ?? null;
  const [slot, setSlot] = useState<TypingSlot | null>(null);
  const seq = useRef(0);
  const newest = rows.length ? rows[rows.length - 1].id : 0;
  const newestRef = useRef(newest);
  useEffect(() => {
    newestRef.current = newest;
  }, [newest]);

  // Its reply landed: hide the bubble in the same render the message appears, so it reads as one bubble turning into the other.
  const landedId = slot ? landed(slot, rows) : null;

  // Each step is one timed move: landed -> gone; left `working` -> hold, then fade out, then gone; nobody typing -> next one after a beat.
  useEffect(() => {
    let delay: number;
    let to: (s: TypingSlot | null) => TypingSlot | null;
    if (slot && landedId != null) [delay, to] = [0, () => null];
    else if (slot?.phase === "on" && slot.bot !== next) [delay, to] = [0, (s) => s && { ...s, phase: "hold" }];
    else if (slot?.phase === "hold" && slot.bot === next) [delay, to] = [0, (s) => s && { ...s, phase: "on" }];
    else if (slot?.phase === "hold") [delay, to] = [HOLD_MS, (s) => s && { ...s, phase: "out" }];
    else if (slot?.phase === "out") [delay, to] = [OUT_MS, () => null];
    else if (!slot && next)
      [delay, to] = [BEAT_MS, () => ({ bot: next, n: ++seq.current, afterId: newestRef.current, since: Date.now(), phase: "on" })];
    else return;
    const n = slot?.n;
    const t = setTimeout(() => setSlot((s) => (s?.n === n ? to(s) : s)), delay);
    return () => clearTimeout(t);
  }, [slot, next, landedId]);

  return { typing: slot && landedId == null ? slot : null, landedId };
}
