// Which progress view is open (null = closed). A tiny module-level store: anyone can call openReport().
import { useSyncExternalStore } from "react";
import type { ReportView } from "./types";

let current: ReportView | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Opens the full-screen progress report on `view` (default today). Safe to call before <ReportHost /> mounts. */
export function openReport(view: ReportView = "today"): void {
  if (typeof window === "undefined" || current === view) return;
  current = view;
  emit();
}

export function closeReport(): void {
  if (current === null) return;
  current = null;
  emit();
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function useOpenReport(): ReportView | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
