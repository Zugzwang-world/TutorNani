"use client";
// The full-screen progress report (REFINE R7): Today · This week · This month · All time, with an animated switch.
// Loaded lazily by ReportHost; opened with openReport(view). Closes with ✕ or Esc.
import "./report.css";
import { Baloo_2 } from "next/font/google";
import { useEffect, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ensureReport, peekReport, prefetchOthers, subscribeReport } from "./data";
import { periodLabel } from "./format";
import { Learning } from "./learning";
import { Best, Days, Feelings, Garden, Lines, Routine, Tricky } from "./sections";
import { REPORT_VIEWS, VIEW_LABEL, type ReportView } from "./types";

// Baloo 2 (Ek Type): a rounded Indian display face for the report's headlines; Nunito stays the body face.
const baloo = Baloo_2({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-baloo", display: "swap", preload: false });

function useReport(view: ReportView, prev: ReportView | null) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [failedFor, setFailedFor] = useState<ReportView | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => subscribeReport(bump), []);
  useEffect(() => {
    let alive = true;
    void ensureReport(view).then((ok) => {
      if (!alive) return;
      setFailedFor(ok ? null : view);
      if (ok) void prefetchOthers(view);
    });
    return () => {
      alive = false;
    };
  }, [view, attempt]);
  const cur = peekReport(view);
  return {
    data: cur ?? (prev ? peekReport(prev) : null),
    loading: !cur,
    failed: failedFor === view && !cur,
    retry: () => setAttempt((a) => a + 1),
  };
}

function Switch({ view, onChange }: { view: ReportView; onChange: (v: ReportView) => void }) {
  const i = REPORT_VIEWS.indexOf(view);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = REPORT_VIEWS[(i + (e.key === "ArrowRight" ? 1 : 3)) % 4];
    onChange(next);
    (e.currentTarget.querySelector(`[data-v="${next}"]`) as HTMLButtonElement | null)?.focus();
  };
  return (
    <div className="rp-switch" role="tablist" aria-label="Period" style={{ "--i": i } as CSSProperties} onKeyDown={onKey}>
      <span className="rp-switch-thumb" aria-hidden />
      {REPORT_VIEWS.map((v) => (
        <button key={v} type="button" role="tab" data-v={v} aria-selected={v === view} tabIndex={v === view ? 0 : -1} onClick={() => onChange(v)} className="rp-display">
          {VIEW_LABEL[v]}
        </button>
      ))}
    </div>
  );
}

function Opening({ failed, onRetry, child }: { failed: boolean; onRetry: () => void; child: string }) {
  return (
    <div className="grid min-h-[50vh] place-content-center text-center" aria-live="polite">
      {failed ? (
        <>
          <p className="rp-display text-[22px] font-bold">The report didn&apos;t load.</p>
          <p className="rp-sub mt-1">Check the connection, then try again.</p>
          <button type="button" onClick={onRetry} className="rp-focus rp-display mx-auto mt-4 rounded-full bg-[#f29a0e] px-5 py-2 text-[17px] font-bold text-[#2b1600]">
            Try again
          </button>
        </>
      ) : (
        <>
          <svg viewBox="-30 -30 60 60" className="rp-writing mx-auto h-14 w-14" aria-hidden>
            {Array.from({ length: 9 }, (_, j) => {
              const a = (j * 2 * Math.PI) / 9;
              return <circle key={j} cx={12 * Math.cos(a)} cy={12 * Math.sin(a)} r="8" fill="#f29a0e" />;
            })}
            <circle r="12" fill="#ffb631" />
          </svg>
          <p className="rp-display mt-3 text-[20px] font-bold">Opening {child}&apos;s progress…</p>
        </>
      )}
    </div>
  );
}

export default function ReportOverlay({ initialView, onClose }: { initialView: ReportView; onClose: () => void }) {
  const [view, setView] = useState<ReportView>(initialView);
  const [prev, setPrev] = useState<ReportView | null>(null);
  const { data, loading, failed, retry } = useReport(view, prev);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  const pick = (v: ReportView) => {
    if (v === view) return;
    setPrev(view);
    setView(v);
  };

  // If the exit animation never reports back (reduced motion, background tab), still close.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 400);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus moves in, and goes back to what was tapped.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const child = data?.childName ?? "Aarav";
  return (
    <div className={`rp-root ${baloo.variable} fixed inset-0 z-[110]`} role="dialog" aria-modal="true" aria-label={`${child}'s progress`}>
      <div
        ref={panel}
        tabIndex={-1}
        data-closing={closing}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
        className="rp-panel absolute inset-0 outline-none"
      >
        <div ref={scroller} className="absolute inset-0 overflow-y-auto overscroll-contain">
          <div className="rp-zoom">
            <header className="rp-head sticky top-0 z-10" style={{ paddingTop: "env(safe-area-inset-top)" }}>
              <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-3 pb-3">
                <div className="min-w-0 flex-1">
                  <h1 className="rp-display truncate text-[27px] leading-[1.05] font-extrabold">{child}&apos;s progress</h1>
                  <p key={data ? `${data.view}${data.from}` : "x"} className="rp-sub rp-fade truncate">
                    {data ? periodLabel(data) : " "}
                  </p>
                </div>
                <div className="order-3 w-full md:order-none md:w-[460px]">
                  <Switch view={view} onChange={pick} />
                </div>
                <button
                  type="button"
                  onClick={() => setClosing(true)}
                  aria-label="Close the progress report"
                  className="rp-close rp-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f0e4d4]/80 text-[#2b2118]/70 hover:bg-[#f0e4d4]"
                >
                  <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </header>

            <main className="mx-auto max-w-[1180px] px-4 pt-7 pb-[max(48px,env(safe-area-inset-bottom))]">
              {data ? (
                <div className="rp-grid transition-opacity duration-200" style={{ opacity: loading ? 0.55 : 1 }} aria-busy={loading}>
                  <Lines r={data} />
                  <Garden r={data} />
                  <Learning r={data} />
                  <Days r={data} />
                  <Feelings r={data} />
                  <Tricky r={data} />
                  <Routine r={data} />
                  <Best r={data} />
                </div>
              ) : (
                <Opening failed={failed} onRetry={retry} child={child} />
              )}
              <footer className="mt-14 border-t border-[#f0e4d4] pt-4 text-[13.5px] leading-relaxed text-[#8a7a6a]">
                No scores and no comparisons: just {child}&apos;s own story of growing. Days before today are sample history for the demo; today fills in live as he plays with Nani.
              </footer>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
