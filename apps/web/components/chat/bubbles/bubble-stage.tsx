"use client";
// The chat column with idea bubbles floating on both sides of it. Widths come from the chat's container (CSS container
// queries in bubbles.css), so the same code fits the stage's half, a laptop and a phone (chips only, in composer.tsx).
import "./bubbles.css";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Bubble } from "@/lib/types";
import type { Pending, Row } from "../use-chat";
import { BubbleCard } from "./bubble-card";
import { useBubbleSlots } from "./use-bubble-slots";

const MAX_PER_RAIL = 3;

/** The picked bubble flies to the composer while it posts; the card itself is replaced by the next one. */
function fly(card: HTMLElement) {
  const root = card.closest<HTMLElement>(".tg-gc");
  const target = root?.querySelector<HTMLElement>("[data-tg-composer]");
  if (!root || !target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rr = root.getBoundingClientRect();
  const from = card.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("aria-label");
  ghost.setAttribute("aria-hidden", "true");
  ghost.classList.add("tg-ghost");
  Object.assign(ghost.style, {
    position: "absolute",
    left: `${from.left - rr.left}px`,
    top: `${from.top - rr.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    pointerEvents: "none",
  });
  root.appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + 26 - (from.top + from.height / 2);
  const k = Math.min(0.32, (to.width * 0.7) / from.width);
  const anim = ghost.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
      {
        transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 40}px) scale(${(1 + k) / 1.7}) rotate(${dx > 0 ? 5 : -5}deg)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0deg)`,
        opacity: 0,
      },
    ],
    {
      duration: 520,
      easing: "cubic-bezier(0.5, 0, 0.25, 1)",
      fill: "forwards",
    },
  );
  const done = () => ghost.remove();
  anim.onfinish = done;
  anim.oncancel = done;
}

export function BubbleStage({
  rows,
  pending,
  loaded,
  onSend,
  children,
}: {
  rows: Row[];
  pending: Pending[];
  loaded: boolean;
  onSend: (text: string, as: string) => void;
  children: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [perRail, setPerRail] = useState(MAX_PER_RAIL);

  // How many fit in a rail: its height over the tier's bubble height (--tg-bub-h in bubbles.css).
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const est = parseFloat(cs.getPropertyValue("--tg-bub-h")) || 250;
      const gap = parseFloat(cs.getPropertyValue("--tg-rail-gap")) || 14;
      const rail = el.querySelector(".tg-rail");
      const pad = rail ? parseFloat(getComputedStyle(rail).paddingTop) + parseFloat(getComputedStyle(rail).paddingBottom) : 0;
      const h = el.clientHeight - pad;
      if (h < 100) return; // rails hidden (phone)
      setPerRail(Math.max(1, Math.min(MAX_PER_RAIL, Math.floor((h + gap) / (est + gap)))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { shown, nextId } = useBubbleSlots({
    rows,
    pending,
    loaded,
    total: perRail * 2,
  });

  const pick = (b: Bubble, el: HTMLElement) => {
    fly(el);
    onSend(b.line, b.parent); // always as its own parent
  };

  const rail = (side: "left" | "right") => (
    <div className="tg-rail" data-side={side} aria-label={side === "left" ? "Ideas, left" : "Ideas, right"}>
      {shown.map((b, i) =>
        i % 2 === (side === "left" ? 0 : 1) ? <BubbleCard key={b.id} bubble={b} index={i} side={side} next={b.id === nextId} onPick={pick} /> : null,
      )}
    </div>
  );

  return (
    <div ref={wrap} className="tg-wrap">
      {rail("left")}
      {children}
      {rail("right")}
    </div>
  );
}
