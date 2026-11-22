"use client";
// Which bubbles are showing. The best bubbles (stage-script steps first, then the rest, used ones last) hold the slots.
// A slot keeps its bubble until that bubble drops out of the best set, so a used bubble is replaced in place.
import { useState } from "react";
import { BUBBLES } from "@/lib/config";
import type { Bubble } from "@/lib/types";
import type { Pending, Row } from "../use-chat";

/** Config order with the stage-script steps first, by step. */
const BASE: Bubble[] = [...BUBBLES].sort((a, b) => (a.step ?? 1e9) - (b.step ?? 1e9));
const BY_ID = new Map(BUBBLES.map((b) => [b.id, b]));

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/** Lines already posted in the chat (or on their way): line -> the order it was posted in. */
function postedLines(rows: Row[], pending: Pending[]): Map<string, number> {
  const posted = new Map<string, number>();
  const lines = new Set(BUBBLES.map((b) => norm(b.line)));
  for (const r of rows) {
    if (r.sender_kind !== "parent") continue;
    const t = norm(r.text);
    if (lines.has(t)) posted.set(t, r.id);
  }
  pending.forEach((p, i) => {
    const t = norm(p.text);
    if (lines.has(t)) posted.set(t, 1e9 + i);
  });
  return posted;
}

function reconcile(prev: string[], best: string[], total: number): string[] {
  const keep = best.slice(0, total);
  const next: (string | null)[] = Array.from({ length: total }, (_, i) => (prev[i] && keep.includes(prev[i]) ? prev[i] : null));
  const free = keep.filter((id) => !next.includes(id));
  return next.map((id) => id ?? free.shift() ?? "").filter(Boolean);
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function useBubbleSlots({ rows, pending, loaded, total }: { rows: Row[]; pending: Pending[]; loaded: boolean; total: number }) {
  const [slots, setSlots] = useState<string[]>([]);
  const posted = postedLines(rows, pending);
  const used = (b: Bubble) => posted.has(norm(b.line));

  // Best first: unused ones in base order, then used ones by when they were posted (oldest first: the end of the queue).
  const best = BASE.map((b, i) => ({
    id: b.id,
    key: used(b) ? 1e6 + (posted.get(norm(b.line)) ?? 0) : i,
  }))
    .sort((x, y) => x.key - y.key)
    .map((x) => x.id);

  if (loaded) {
    const next = reconcile(slots, best, total);
    if (!same(next, slots)) setSlots(next);
  }

  // The next bubble in the stage script: the lowest step whose line has not been posted.
  const nextId = BASE.find((b) => b.step != null && !used(b))?.id ?? null;
  const shown = slots.map((id) => BY_ID.get(id)).filter((b): b is Bubble => !!b);
  return { shown, nextId };
}
