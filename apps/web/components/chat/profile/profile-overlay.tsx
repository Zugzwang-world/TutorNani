"use client";
// The full-screen profile of one agent. Closes with ✕, Esc or a swipe down.
// Loaded lazily by ProfileHost; opened with openProfile(bot).
import "./profile.css";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import { BOTS, type BotKey } from "@/lib/types";
import { BotAvatar } from "../avatar";
import { toneOf } from "../ui";
import { Card, Examples, FileNow, HowIWork, ListenFor, Versions, WhoIAm } from "./sections";
import { useProfileData } from "./use-profile";

const COLOR_VAR: Record<string, [string, string]> = {
  marigold: ["var(--color-marigold)", "var(--color-marigold-soft)"],
  routine: ["var(--color-routine)", "var(--color-routine-soft)"],
  rules: ["var(--color-rules)", "var(--color-rules-soft)"],
  lessons: ["var(--color-lessons)", "var(--color-lessons-soft)"],
  memory: ["var(--color-memory)", "var(--color-memory-soft)"],
};

export default function ProfileOverlay({ bot, onClose }: { bot: BotKey; onClose: () => void }) {
  const info = BOTS[bot];
  const tone = toneOf(info);
  const [pc, pcs] = COLOR_VAR[info.color] ?? COLOR_VAR.marigold;
  const [label, fileName] = info.fileLabel.split(" · ");
  const data = useProfileData(bot);

  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const flick = useRef({ y: 0, t: 0, v: 0 });

  const close = () => setClosing(true);

  // If the exit animation never reports back (reduced motion, background tab), still close.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 450);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus moves in, and goes back to what was tapped. The chat behind is never scrolled.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  // Swipe down: from the header with a finger or mouse, or anywhere once the content is at the top.
  const begin = (y: number, t: number) => {
    startY.current = y;
    flick.current = { y, t, v: 0 };
  };
  const move = (y: number, t: number) => {
    if (startY.current == null) return;
    const dy = y - startY.current;
    if (dy <= 0) {
      if (drag) setDrag(0);
      return;
    }
    if (!dragging) setDragging(true);
    setDrag(dy);
    const f = flick.current;
    if (t > f.t) flick.current = { y, t, v: (y - f.y) / (t - f.t) };
  };
  const end = (t: number) => {
    if (startY.current == null) return;
    startY.current = null;
    setDragging(false);
    const fresh = t - flick.current.t < 120;
    if (drag > 120 || (drag > 30 && fresh && flick.current.v > 0.5)) setClosing(true);
    else setDrag(0);
  };

  const onHeadDown = (e: ReactPointerEvent<HTMLElement>) => {
    begin(e.clientY, e.timeStamp);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  // Is the touch inside something that is itself scrolled down (the page, or the file box)?
  const scrolledDown = (t: EventTarget) => {
    for (let el = t as HTMLElement | null; el && el !== panel.current; el = el.parentElement) if (el.scrollTop > 0) return true;
    return false;
  };
  const onTouchStart = (e: ReactTouchEvent) => {
    if ((e.target as HTMLElement).closest("header")) return; // the header has its own pointer drag
    if (!scrolledDown(e.target)) begin(e.touches[0].clientY, e.timeStamp);
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    if ((e.target as HTMLElement).closest("header")) return;
    if (!dragging && scrolledDown(e.target)) {
      startY.current = null;
      return;
    }
    move(e.touches[0].clientY, e.timeStamp);
  };

  return (
    <div
      className="pf-root fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={`${info.name}'s profile`}
      style={{ "--pc": pc, "--pcs": pcs } as CSSProperties}
    >
      <div
        ref={panel}
        tabIndex={-1}
        data-closing={closing}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={(e) => end(e.timeStamp)}
        onTouchCancel={(e) => end(e.timeStamp)}
        className="pf-panel absolute inset-0 bg-cream outline-none"
        style={
          {
            transform: !closing && drag ? `translateY(${drag}px)` : undefined,
            transition: !dragging && !closing ? "transform 260ms cubic-bezier(0.32,0.72,0,1)" : undefined,
            borderTopLeftRadius: drag ? 24 : undefined,
            borderTopRightRadius: drag ? 24 : undefined,
            "--pf-drag": `${drag}px`,
          } as CSSProperties
        }
      >
        <div ref={scroller} className="absolute inset-0 overflow-y-auto overscroll-contain">
          <div className="pf-zoom">
            {/* top bar: also the drag handle */}
            <header
              className="tg-safe-top sticky top-0 z-10 cursor-grab touch-none border-b border-line/80 bg-cream/92 backdrop-blur-md select-none"
              onPointerDown={onHeadDown}
              onPointerMove={(e) => move(e.clientY, e.timeStamp)}
              onPointerUp={(e) => end(e.timeStamp)}
              onPointerCancel={(e) => end(e.timeStamp)}
            >
              <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 pt-2 pb-2.5 lg:max-w-[1100px]">
                <BotAvatar bot={info} size={38} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[18px] leading-tight font-extrabold ${tone.text}`}>{info.name}</p>
                  <p className="truncate font-mono text-[12.5px] text-muted">
                    {label !== info.name ? `${label} · ` : ""}{fileName}
                  </p>
                </div>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={close}
                  aria-label="Close profile"
                  className="tg-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-line/70 text-ink/70 hover:bg-line"
                >
                  <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div aria-hidden className="mx-auto -mt-1 mb-1.5 h-1 w-9 rounded-full bg-ink/15 lg:hidden" />
            </header>

            <main className="mx-auto grid max-w-[640px] gap-x-8 gap-y-6 px-4 pt-4 pb-[max(40px,env(safe-area-inset-bottom))] lg:max-w-[1100px] lg:grid-cols-2 lg:items-start">
              <div className="space-y-6">
                <WhoIAm bot={bot} versions={data.versions} />
                <Card n={2} title="How I work" delay={1}>
                  <HowIWork bot={bot} />
                </Card>
                <Card n={3} title="What I listen for" delay={2}>
                  <ListenFor bot={bot} />
                </Card>
              </div>
              <div className="space-y-6">
                <Card n={4} title="Examples" sub="before → after" delay={3}>
                  <Examples bot={bot} data={data} />
                </Card>
                <Card n={5} title="My file now" sub="today's new lines are lit" delay={4}>
                  <FileNow data={data} />
                </Card>
                <Card n={6} title="Versions" sub="tap one to see what changed" delay={5}>
                  <Versions data={data} />
                </Card>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
