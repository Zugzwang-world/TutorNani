// POST /api/brief: Memory posts the evening brief and logs the day in brain.md (PLAN.md C12).
// Called by the 19:00 Routine job or the presenter. No body needed. Returns { ok, messageId, toVersion }.
// After the brief is posted, today's progress row is refreshed (REFINE R7.2), never alongside the brief's brain call.
import { after } from "next/server";
import { runBrief } from "@/lib/agents/memory-brief";
import { getToday } from "../progress/build";

export const maxDuration = 60;

export async function POST() {
  const t0 = Date.now();
  try {
    const r = await runBrief();
    console.log(`[brief] ${JSON.stringify({ ...r, ms: Date.now() - t0 })}`);
    after(async () => {
      const t1 = Date.now();
      try {
        const t = await getToday();
        console.log(`[brief] progress ${t.source} in ${Date.now() - t1} ms`);
      } catch (e) {
        console.warn(`[brief] progress failed: ${(e as Error).message}`);
      }
    });
    return Response.json(r);
  } catch (e) {
    console.error(`[brief] failed: ${(e as Error).message}`);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
