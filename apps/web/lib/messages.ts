// Chat messages (server-only).
import { supabaseAdmin } from "./supabase/server";
import type { Message, MessageMeta, SenderKind } from "./types";

/** Agent bubbles are plain text: drop markdown bold/italics the brain sometimes adds. */
function plain(t: string): string {
  return t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
}

export async function post(
  child: string,
  sender: string,
  senderKind: SenderKind,
  text: string,
  meta: MessageMeta = {},
  audioUrl: string | null = null,
): Promise<Message> {
  const { data, error } = await supabaseAdmin()
    .from("messages")
    .insert({ child_id: child, sender, sender_kind: senderKind, text: senderKind === "bot" ? plain(text) : text, meta, audio_url: audioUrl })
    .select()
    .single();
  if (error) throw new Error(`messages.post: ${error.message}`);
  return data as Message;
}

/** The last `limit` messages, oldest first. */
export async function recent(child: string, limit = 10): Promise<Message[]> {
  const { data, error } = await supabaseAdmin()
    .from("messages")
    .select("*")
    .eq("child_id", child)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`messages.recent: ${error.message}`);
  return (data as Message[]).reverse();
}

export async function updateMeta(id: number, meta: MessageMeta): Promise<void> {
  const { error } = await supabaseAdmin().from("messages").update({ meta }).eq("id", id);
  if (error) throw new Error(`messages.updateMeta: ${error.message}`);
}
