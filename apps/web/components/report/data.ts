// The report's data in the browser: one cache per view (60 s), and requests one at a time.
// A view first loads with quick=1 (at once, no brain call); if today's lines are still pending, the full request follows.
import { REPORT_VIEWS, type ReportData, type ReportView } from "./types";

const TTL_MS = 60_000;
const cache = new Map<ReportView, { data: ReportData; at: number }>();
const subs = new Set<() => void>();
const running = new Map<string, Promise<ReportData | null>>();
let queue: Promise<unknown> = Promise.resolve();

export function peekReport(view: ReportView): ReportData | null {
  return cache.get(view)?.data ?? null;
}

export function subscribeReport(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

function fresh(view: ReportView): boolean {
  const c = cache.get(view);
  return !!c && !c.data.pending && Date.now() - c.at < TTL_MS;
}

/** One request, queued behind the others so the server never builds two reports at once. */
function request(view: ReportView, quick: boolean): Promise<ReportData | null> {
  const key = `${view}:${quick ? 1 : 0}`;
  const had = running.get(key);
  if (had) return had;
  const p: Promise<ReportData | null> = queue
    .then(async () => {
      try {
        const res = await fetch(`/api/progress?view=${view}${quick ? "&quick=1" : ""}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`progress ${res.status}`);
        const data = (await res.json()) as ReportData;
        cache.set(view, { data, at: Date.now() });
        subs.forEach((f) => f());
        return data;
      } catch (e) {
        console.warn(`[report] ${(e as Error).message}`);
        return null;
      }
    })
    .finally(() => running.delete(key));
  queue = p;
  running.set(key, p);
  return p;
}

/** Makes sure a view is loaded and its lines are final. False if the server could not be reached. */
export async function ensureReport(view: ReportView): Promise<boolean> {
  if (fresh(view)) return true;
  const c = cache.get(view);
  let data = c && Date.now() - c.at < TTL_MS ? c.data : await request(view, true);
  if (data?.pending) data = (await request(view, false)) ?? data;
  return !!data;
}

/** Warms the cache, e.g. when a 📈 card appears, so opening it is instant. */
export function prefetchReport(view: ReportView = "today"): void {
  if (typeof window === "undefined" || fresh(view)) return;
  void ensureReport(view);
}

/** After the open view is ready: the other views, quick only, one after another. */
export async function prefetchOthers(view: ReportView): Promise<void> {
  for (const v of REPORT_VIEWS) {
    if (v === view || fresh(v)) continue;
    await request(v, true);
  }
}
