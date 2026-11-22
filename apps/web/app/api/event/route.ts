import { CHILD_ID } from "@/lib/config";
import { getAllLatest } from "@/lib/files";
import { post } from "@/lib/messages";
import { supabaseAdmin } from "@/lib/supabase/server";
import { BOT_KEYS, type BotKey, type MessageMeta, type TurnKind } from "@/lib/types";

// System events and routine fires from the browser (toy, presenter). CONTRACTS.md "POST /api/event".
// Body: { bot, text?, meta?, turn?: { kind, child_text?, nani_text?, meta? } }
// A job fire passes turn.kind "job" with turn.meta { jobKey, dueAt }: the second fire for the same
// jobKey + dueAt returns { duplicate: true } and posts nothing.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    bot?: BotKey;
    text?: string;
    meta?: MessageMeta;
    turn?: { kind: TurnKind; child_text?: string; nani_text?: string; meta?: Record<string, unknown> };
  } | null;
  if (!body || !body.bot || !BOT_KEYS.includes(body.bot)) {
    return Response.json({ ok: false, error: "bot required" }, { status: 400 });
  }

  let turnId: number | undefined;
  if (body.turn) {
    const files = await getAllLatest(CHILD_ID);
    const file_versions = Object.fromEntries(Object.entries(files).map(([n, f]) => [n, f.version]));
    const { data, error } = await supabaseAdmin()
      .from("turns")
      .insert({
        child_id: CHILD_ID,
        kind: body.turn.kind,
        child_text: body.turn.child_text ?? null,
        nani_text: body.turn.nani_text ?? null,
        file_versions,
        meta: body.turn.meta ?? {},
      })
      .select("id")
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return Response.json({ ok: true, duplicate: true });
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    turnId = data.id;
  }

  let messageId: number | undefined;
  if (body.text) {
    const m = await post(CHILD_ID, body.bot, "bot", body.text, { kind: "event", ...(body.meta ?? {}) });
    messageId = m.id;
  }
  return Response.json({ ok: true, turnId, messageId });
}
