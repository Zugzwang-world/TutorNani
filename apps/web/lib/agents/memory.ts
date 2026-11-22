// Memory's shared context (PLAN.md C12): today's full turns with their cues, Nani's notes, and brain.md. Server-only.
import { config } from "../config";
import { clockParts } from "../clock";
import { stripMarkers } from "../markers";
import { supabaseAdmin } from "../supabase/server";
import type { Cue, Message, Turn } from "../types";

const child = config.childName;
const nani = config.grandmaName;

export type DayTurn = Pick<Turn, "kind" | "child_text" | "nani_text" | "cues" | "created_at">;

/** Real start of today in India (turns are stamped with real time, like the sorter's todaysTurns). */
function indiaDayStart(): Date {
  const now = new Date();
  return new Date(now.getTime() - clockParts(now).minutes * 60_000 - (now.getTime() % 60_000));
}

/** Every turn of today, oldest first (at most `limit`, the newest ones). Throws on a database error. */
export async function dayTurns(childId: string, limit = 60): Promise<DayTurn[]> {
  const { data, error } = await supabaseAdmin()
    .from("turns")
    .select("kind, child_text, nani_text, cues, created_at")
    .eq("child_id", childId)
    .gte("created_at", indiaDayStart().toISOString())
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`memory.dayTurns: ${error.message}`);
  return (data as DayTurn[]).reverse();
}

/** Today's outcome notes that Nani's turns left in the chat (meta kind "note"). Empty on error. */
export async function dayNotes(childId: string, limit = 20): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("messages")
    .select("sender, text")
    .eq("child_id", childId)
    .contains("meta", { kind: "note" })
    .gte("created_at", indiaDayStart().toISOString())
    .order("id", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn(`[memory] notes: ${error.message}`);
    return [];
  }
  return (data as Pick<Message, "sender" | "text">[]).reverse().map((m) => m.text);
}

function cueText(c: Cue): string {
  switch (c.type) {
    case "show":
      return `showed ${c.emoji} ${c.word}`;
    case "spell":
      return `spelling game: ${c.word}, letter ${c.gap} missing (tiles ${c.tiles.join(" ")})`;
    case "tile":
      return `picked ${c.letter}: ${c.result}`;
    case "count":
      return c.b !== undefined ? `counted ${c.a} + ${c.b} ${c.emoji}` : `counted ${c.a} ${c.emoji}`;
    case "choices":
      return `choices ${c.items.map((i) => i.label).join(" / ")}`;
    case "cheer":
      return `cheered ${c.emoji}`;
    case "sound":
      return `sound ${c.name}`;
    case "song":
      return "sang a song";
    case "call":
      return `call to ${c.who}`;
  }
}

/** Today's turns as plain lines with full texts and cues. */
export function turnsText(turns: DayTurn[]): string {
  if (!turns.length) return "(none yet today)";
  return turns
    .map((t) => {
      const parts: string[] = [];
      if (t.child_text) parts.push(`${child}: "${t.child_text}"`);
      if (t.nani_text) parts.push(`${nani}: "${stripMarkers(t.nani_text)}"`);
      const cues = (t.cues ?? []).map(cueText);
      return `- ${clockParts(new Date(t.created_at)).hhmm}${t.kind !== "talk" ? ` (${t.kind})` : ""} ${parts.join(" → ")}${cues.length ? ` [${cues.join("; ")}]` : ""}`;
    })
    .join("\n");
}

/** The tone rules Memory follows (GUIDANCE B3) for both the brief and the answers. */
export const MEMORY_TONE = `You are the family's doting historian: proud of ${child}, a little sentimental, and you keep the exact moment rather than a summary. Casual, warm and short, first person, plain words, at most one emoji per line. Say what ${child} did and what happened: his own words in quotes, the word he said or spelled, what he counted, who he shared with. Never generic ("had fun", "learned a lot", "great day"). Never mention files, versions or system words. Never give scores, ratings, timers or minutes, and never compare ${child} with other children. Never invent anything: use only today's turns, ${nani}'s notes and brain.md. Surprises that parents marked secret stay secret.`;
