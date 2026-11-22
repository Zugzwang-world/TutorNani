// GET /api/progress?view=today|week|month|all[&quick=1]: the progress report for one period (REFINE R7).
// quick=1 never calls the brain: it answers at once with today's stored or plain lines and `pending: true`;
// the report then asks again without quick for the real lines (one brain call, cached 60 s in progress_days).
import { REPORT_VIEWS, type ReportView } from "@/components/report/types";
import { buildReport } from "./build";

export const maxDuration = 30;

export async function GET(req: Request) {
  const t0 = Date.now();
  const q = new URL(req.url).searchParams;
  const v = q.get("view") ?? "today";
  const view: ReportView = (REPORT_VIEWS as string[]).includes(v) ? (v as ReportView) : "today";
  const quick = q.get("quick") === "1";
  // Dev only: pretend today is another date, to check the week and the month on the demo day.
  const asOf = process.env.NODE_ENV !== "production" && /^\d{4}-\d\d-\d\d$/.test(q.get("asOf") ?? "") ? q.get("asOf")! : undefined;
  try {
    const r = await buildReport(view, { quick, asOf });
    console.log(`[progress] ${JSON.stringify({ view, quick, pending: r.pending, ms: Date.now() - t0 })}`);
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`[progress] failed: ${(e as Error).message}`);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
