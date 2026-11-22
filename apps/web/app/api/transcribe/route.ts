import { stt } from "@/lib/eleven";
import { supabaseAdmin } from "@/lib/supabase/server";

// Parent voice note: store it at audio/voice/<uuid>.<ext> and transcribe it at the same time.
// Returns { text, audioUrl }. audioUrl is null if only the upload failed, so the words still get through.
export const maxDuration = 60;

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

export async function POST(req: Request) {
  let file: FormDataEntryValue | null = null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ error: "expected multipart form with a file" }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "missing file" }, { status: 400 });
  }

  const name = file instanceof File ? file.name : "";
  const type = (file.type || "audio/webm").split(";")[0].trim().toLowerCase();
  const ext = EXT[type] ?? name.split(".").pop()?.toLowerCase() ?? "webm";
  const path = `voice/${crypto.randomUUID()}.${ext}`;
  const storage = supabaseAdmin().storage.from("audio");

  const [up, heard] = await Promise.allSettled([
    storage.upload(path, file, { contentType: type, upsert: false }),
    stt(file, { filename: `voice.${ext}` }),
  ]);

  if (heard.status === "rejected") {
    console.error("transcribe stt:", (heard.reason as Error)?.message);
    return Response.json({ error: "could not transcribe" }, { status: 502 });
  }

  let audioUrl: string | null = null;
  if (up.status === "fulfilled" && !up.value.error) {
    audioUrl = storage.getPublicUrl(path).data.publicUrl;
  } else {
    console.error("transcribe upload:", up.status === "rejected" ? (up.reason as Error)?.message : up.value.error?.message);
  }

  return Response.json({ text: heard.value.text.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim(), audioUrl });
}
