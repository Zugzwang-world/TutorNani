// POST /api/say {text, voiceId?} -> {url, cached}: a line in Nani's voice as a public mp3, cached in the
// `audio` bucket at say/<sha1 of voice|model|text>.mp3. Used by the parent chat's ▶ and routine reminders.
import { createHash } from "node:crypto";
import { config } from "@/lib/config";
import { tts } from "@/lib/eleven";
import { stripMarkers } from "@/lib/markers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cleanSpeech } from "@/lib/voice/speech";

export const maxDuration = 60;

export async function POST(req: Request) {
  const t0 = performance.now();
  let body: { text?: unknown; voiceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON body {text, voiceId?} expected" }, { status: 400 });
  }
  const text = cleanSpeech(stripMarkers(typeof body.text === "string" ? body.text : ""));
  if (!text) return Response.json({ error: "text is empty" }, { status: 400 });

  const voice = typeof body.voiceId === "string" && body.voiceId ? body.voiceId : config.nani.voiceId;
  const model = config.nani.voiceModel; // live model: a reminder's first play should be quick
  const hash = createHash("sha1").update(`${voice}|${model}|${text}`).digest("hex");
  const path = `say/${hash}.mp3`;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${path}`;

  const head = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
  if (head?.ok) {
    console.log(`[say] hit ${Math.round(performance.now() - t0)} ms ${hash}`);
    return Response.json({ url, cached: true });
  }

  try {
    const bytes = await tts(text, { voiceId: voice, modelId: model });
    const tTts = Math.round(performance.now() - t0);
    const { error } = await supabaseAdmin()
      .storage.from("audio")
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`upload: ${error.message}`);
    console.log(`[say] miss tts ${tTts} ms, total ${Math.round(performance.now() - t0)} ms ${hash}`);
    return Response.json({ url, cached: false });
  } catch (e) {
    console.error(`[say] failed: ${(e as Error).message}`);
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
