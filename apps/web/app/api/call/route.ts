import { broadcast } from "@/lib/broadcast";
import { asWho, isCallId, whoLabel, type CallState } from "@/lib/call/shared";
import { CHILD_ID, config } from "@/lib/config";
import { post } from "@/lib/messages";
import { supabaseAdmin } from "@/lib/supabase/server";
import { channelName, type Message, type MessageMeta } from "@/lib/types";
import { POST as postEvent } from "../event/route";

// Call with Mumma (PLAN.md C11, N2). JSON { action: "start" | "join" | "end", callId?, who?, sender? }.
// The call bubble's message meta { kind: "call", callId, callState, who, joinedBy? } is the only state.
//   start: posts Nani's call bubble (ringing) and broadcasts toy:<child> `call ringing`. Returns { callId }.
//   join:  ringing -> open, broadcasts `call open`, Nani posts "<sender> joined the call 📞". Joining an open call just returns ok.
//   end:   -> ended, broadcasts `call ended`, Nani posts "Call with <name> ended ❤️" and records a turns row
//          (kind "call", meta { callId, who, clips }) through POST /api/event. Ending twice is a no-op.
// join and end change the row only if its state still allows it, so two phones (or the toy and a phone)
// racing each other produce one post, not two.
export const maxDuration = 30;

type Body = { action?: string; callId?: string; who?: string; sender?: string; reason?: string };

const toy = channelName.toy(CHILD_ID);

async function findCall(callId: string): Promise<Message | null> {
  const { data } = await supabaseAdmin()
    .from("messages")
    .select("*")
    .eq("child_id", CHILD_ID)
    .eq("meta->>kind", "call")
    .eq("meta->>callId", callId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Message | null) ?? null;
}

/** Set meta only if the row's callState is still one of `from`. True if this request made the change. */
async function moveState(row: Message, from: CallState[], meta: MessageMeta): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("messages")
    .update({ meta })
    .eq("id", row.id)
    .in("meta->>callState", from)
    .select("id");
  if (error) throw new Error(`call state: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Nani's event line (and optional turns row) through POST /api/event, in-process: no extra HTTP hop. */
async function naniEvent(text: string, meta: MessageMeta, turn?: { kind: "call"; meta: Record<string, unknown> }) {
  const res = await postEvent(
    new Request("http://local/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot: "nani", text, meta, ...(turn ? { turn } : {}) }),
    }),
  );
  if (!res.ok) console.error("[call] event failed", res.status, await res.text());
}

async function clipCount(callId: string): Promise<number> {
  const { data } = await supabaseAdmin().storage.from("audio").list(`clips/${callId}`, { limit: 1000 });
  return (data ?? []).filter((f) => f.name && !f.name.startsWith(".")).length;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const action = body?.action;
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);

  try {
    if (action === "start") {
      const who = asWho(body?.who);
      // A call left ringing or open (a reloaded toy, a closed tab) is closed quietly: one live call at a time.
      const { data: stale } = await supabaseAdmin()
        .from("messages")
        .select("*")
        .eq("child_id", CHILD_ID)
        .eq("meta->>kind", "call")
        .in("meta->>callState", ["ringing", "open"]);
      for (const row of (stale ?? []) as Message[]) {
        await moveState(row, ["ringing", "open"], { ...row.meta, callState: "ended", endedAt: new Date().toISOString(), endReason: "replaced" });
      }

      const callId = crypto.randomUUID();
      const meta: MessageMeta = { kind: "call", callId, callState: "ringing", who, startedAt: new Date().toISOString() };
      const m = await post(CHILD_ID, "nani", "bot", `📞 ${config.childName} wants to show you something!`, meta);
      await broadcast(toy, "call", { callId, state: "ringing", who });
      console.log(`[call] start ${who} ${callId} in ${ms()} ms`);
      return Response.json({ ok: true, callId, who, state: "ringing", messageId: m.id });
    }

    if (action !== "join" && action !== "end") return Response.json({ ok: false, error: "action must be start, join or end" }, { status: 400 });
    if (!isCallId(body?.callId)) return Response.json({ ok: false, error: "callId required" }, { status: 400 });
    const callId = body.callId;
    const row = await findCall(callId);
    if (!row) return Response.json({ ok: false, error: "no such call" }, { status: 404 });
    const who = asWho(row.meta.who);
    const state = (row.meta.callState ?? "ringing") as CallState;

    if (action === "join") {
      if (state === "ended") return Response.json({ ok: false, callId, who, state: "ended", error: "call ended" }, { status: 409 });
      const sender = (body?.sender ?? "").trim().slice(0, 40) || whoLabel(who);
      if (state === "ringing") {
        const won = await moveState(row, ["ringing"], { ...row.meta, callState: "open", joinedBy: sender, openedAt: new Date().toISOString() });
        if (won) {
          await broadcast(toy, "call", { callId, state: "open", who });
          await naniEvent(`${sender} joined the call 📞`, { callId });
        }
      }
      console.log(`[call] join ${callId} by ${sender} in ${ms()} ms`);
      const fresh = await findCall(callId);
      return Response.json({ ok: true, callId, who, state: fresh?.meta.callState ?? "open", joinedBy: fresh?.meta.joinedBy });
    }

    // end
    if (state === "ended") return Response.json({ ok: true, callId, who, state: "ended", already: true });
    const reason = (body?.reason ?? "").slice(0, 20) || "tap";
    const won = await moveState(row, ["ringing", "open"], { ...row.meta, callState: "ended", endedAt: new Date().toISOString(), endReason: reason });
    if (won) {
      await broadcast(toy, "call", { callId, state: "ended", who });
      const name = typeof row.meta.joinedBy === "string" && row.meta.joinedBy ? row.meta.joinedBy : whoLabel(who);
      const clips = await clipCount(callId);
      await naniEvent(`Call with ${name} ended ❤️`, { callId }, { kind: "call", meta: { callId, who, clips, reason } });
    }
    console.log(`[call] end ${callId} (${reason}) in ${ms()} ms`);
    return Response.json({ ok: true, callId, who, state: "ended", already: !won });
  } catch (e) {
    console.error("[call]", action, (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
