import { broadcast } from "@/lib/broadcast";
import { offsetToJumpTo } from "@/lib/clock";
import { CHILD_ID } from "@/lib/config";
import { getDemoState, setDemoState } from "@/lib/demo-state";
import { channelName } from "@/lib/types";

// Presenter controls (PLAN.md C13). Bodies:
//   { action: "clock", addMs }   add to the demo clock offset
//   { action: "jump", hhmm }     make the demo clock read hh:mm today (India time)
//   { action: "real" }           back to real time (offset 0)
//   { action: "timings", show }  show or hide the wall's timings corner
//   { action: "fire_next" }      toy fires the next upcoming routine job now
// Updates demo_state, then broadcasts to /toy or /home-base. Returns { ok, state }.
type Body =
  | { action: "clock"; addMs: number }
  | { action: "jump"; hhmm: string }
  | { action: "real" }
  | { action: "timings"; show: boolean }
  | { action: "fire_next" };

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") return Response.json({ ok: false, error: "bad body" }, { status: 400 });

  try {
    const cur = await getDemoState(CHILD_ID);
    const setClock = async (offsetMs: number) => {
      const state = await setDemoState(CHILD_ID, { clock_offset_ms: offsetMs });
      await broadcast(channelName.toy(CHILD_ID), "clock", { offsetMs });
      return state;
    };

    switch (body.action) {
      case "clock": {
        if (typeof body.addMs !== "number" || !Number.isFinite(body.addMs)) {
          return Response.json({ ok: false, error: "addMs must be a number" }, { status: 400 });
        }
        return Response.json({ ok: true, state: await setClock(cur.clock_offset_ms + body.addMs) });
      }
      case "jump": {
        if (typeof body.hhmm !== "string" || !HHMM.test(body.hhmm)) {
          return Response.json({ ok: false, error: "hhmm must look like 12:00" }, { status: 400 });
        }
        return Response.json({ ok: true, state: await setClock(offsetToJumpTo(body.hhmm, cur.clock_offset_ms)) });
      }
      case "real":
        return Response.json({ ok: true, state: await setClock(0) });
      case "timings": {
        const show = !!body.show;
        const state = await setDemoState(CHILD_ID, { show_timings: show });
        await broadcast(channelName.wall(CHILD_ID), "timings", { show });
        return Response.json({ ok: true, state });
      }
      case "fire_next":
        await broadcast(channelName.toy(CHILD_ID), "fire_next_job", {});
        return Response.json({ ok: true, state: cur });
      default:
        return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
