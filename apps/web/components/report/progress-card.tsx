"use client";
// The "📈 Aarav's progress" card under Memory's replies that carry meta.progress (R7.5), and the 📈 header button.
import { useEffect } from "react";
import { config } from "@/lib/config";
import { prefetchReport } from "./data";
import { openReport } from "./store";
import type { ReportView } from "./types";

const SUB: Record<ReportView, string> = {
  today: "Today, with his week and month",
  week: "His week, day by day",
  month: "His month, day by day",
  all: "Everything so far",
};

/** warm: the reply just arrived, so get the report ready now and the tap opens it at once. */
export function ProgressCard({ view, warm = false }: { view: ReportView; warm?: boolean }) {
  useEffect(() => {
    if (!warm) return;
    const t = setTimeout(() => prefetchReport(view), 1500); // after the chat's own replies have landed
    return () => clearTimeout(t);
  }, [view, warm]);
  return (
    <button
      type="button"
      onClick={() => openReport(view)}
      onPointerEnter={() => prefetchReport(view)}
      className="group mt-1.5 flex w-[min(300px,100%)] items-center gap-3 rounded-2xl bg-paper py-2.5 pr-3 pl-2.5 text-left shadow-[0_0_0_1.5px_#f6dcae,0_6px_16px_-10px_rgba(178,91,0,0.55)] transition-transform duration-150 active:scale-[0.98]"
    >
      <span aria-hidden className="emoji grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-marigold-soft text-[22px]">
        📈
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-tight font-extrabold">{config.childName}&apos;s progress</span>
        <span className="block truncate text-[13px] text-muted">{SUB[view]}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-[#b25b00] transition-transform duration-150 group-hover:translate-x-0.5">
        <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** The 📈 button in the chat header. */
export function ProgressButton() {
  return (
    <button
      type="button"
      onClick={() => openReport("today")}
      onPointerEnter={() => prefetchReport("today")}
      aria-label={`Open ${config.childName}'s progress`}
      title={`${config.childName}'s progress`}
      className="emoji grid h-8 w-8 shrink-0 place-items-center rounded-full bg-marigold-soft text-[16px] shadow-[0_0_0_1.5px_#f6dcae] transition-transform duration-150 active:scale-95"
    >
      📈
    </button>
  );
}
