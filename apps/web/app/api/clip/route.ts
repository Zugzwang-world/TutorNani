import { broadcast } from "@/lib/broadcast";
import { isCallId } from "@/lib/call/shared";
import { CHILD_ID, config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { channelName } from "@/lib/types";

// One walkie-talkie clip (N2). multipart: file, callId, from ("toy" | "parent"), sender.
// Stores it at audio/clips/<callId>/<ms>.<ext> and broadcasts toy:<child> `clip {callId, from, url, sender}`.
// Clients send 16 kHz WAV (lib/call/client.ts), so every browser can play it; other types are stored as sent.
// Returns { ok, url, ms: { store, broadcast } } so each hop's time can be shown.
export const maxDuration = 30;

const EXT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "expected multipart form" }, { status: 400 });
  }
  const file = form.get("file");
  const callId = form.get("callId");
  const from = form.get("from") === "parent" ? "parent" : "toy";
  const sender = String(form.get("sender") ?? "").slice(0, 40) || (from === "toy" ? config.childName : "Parent");
  if (!(file instanceof Blob) || file.size === 0) return Response.json({ ok: false, error: "missing file" }, { status: 400 });
  if (!isCallId(callId)) return Response.json({ ok: false, error: "bad callId" }, { status: 400 });

  const type = (file.type || "audio/webm").split(";")[0].trim().toLowerCase();
  const ext = EXT[type] ?? "webm";
  const path = `clips/${callId}/${Date.now()}.${ext}`;
  const storage = supabaseAdmin().storage.from("audio");

  const t0 = performance.now();
  const up = await storage.upload(path, file, { contentType: type.startsWith("audio/") ? type : "audio/webm", upsert: false });
  const t1 = performance.now();
  if (up.error) {
    console.error("[clip] store failed:", up.error.message);
    return Response.json({ ok: false, error: "store failed" }, { status: 502 });
  }
  const url = storage.getPublicUrl(path).data.publicUrl;
  try {
    await broadcast(channelName.toy(CHILD_ID), "clip", { callId, from, url, sender });
  } catch (e) {
    console.error("[clip] broadcast failed:", (e as Error).message);
    return Response.json({ ok: false, url, error: "broadcast failed" }, { status: 502 });
  }
  const t2 = performance.now();
  const ms = { store: Math.round(t1 - t0), broadcast: Math.round(t2 - t1) };
  console.log(`[clip] ${from} ${Math.round(file.size / 1024)} KB ${type}: store ${ms.store} ms, broadcast ${ms.broadcast} ms`);
  return Response.json({ ok: true, url, ms });
}
