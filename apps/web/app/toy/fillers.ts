// Waiting moments (REFINE R3): what plays while Nani thinks. Pure picking logic; talk-loop.ts does the timing.
//   At the send tap: one calm reaction, never the same twice in a row.
//   Only when Nani is really late (no first sentence 2.5 s after the tap): the wordless wait_music loop.
// The spoken learning fillers (filler_*, filler_numbers_5 included), the chashma line and the song snippet are
// no longer picked while waiting. Their files stay in content/audio.json.
import { audioById } from "@/lib/audio";
import { CHILD_ID } from "@/lib/config";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { AudioEntry } from "@/lib/types";

/** Calm reactions only: "Ooh!" and "Oho!" sound wrong after a sad or scared line. */
export const REACTION_IDS = ["reaction_hmm", "reaction_achha", "reaction_achha_achha", "reaction_haanji"];
/** The soft instrumental loop (kind "music") under a late reply. */
export const WAIT_MUSIC_ID = "wait_music";

// ---------- today's topic (planner.md "## Today") ----------
// use-talk.ts still hands this to the talk loop; since R3 no waiting clip depends on it.

/** What Nani is teaching today: a letter (upper case) and the theme areas. */
export interface Today {
  letter: string | null;
  themes: string[];
}

// Words that put a theme in an area. Used on the planner's theme text ("animals and fruits", or a parent's "mangoes").
const THEME_WORDS: Record<string, RegExp> = {
  animals: /\b(animals?|jaanwar|lion|cow|cat|dog|elephant|monkey|bandar|duck|sheep|horse|rooster|billi|gaay|haathi|ullu|owl|sher)\b/i,
  fruits: /\b(fruits?|phal|mango(es)?|aam|banana|kela|apple|seb|orange|santra|grapes?|angoor)\b/i,
  numbers: /\b(numbers?|count(ing)?|gino|gin|ginti)\b/i,
  letters: /\b(letters?|alphabets?|abc|akshar)\b/i,
  colours: /\b(colou?rs?|rang)\b/i,
  shapes: /\b(shapes?|circle|square|triangle)\b/i,
  body: /\b(body|nose|ears?|naak|kaan)\b/i,
};

export function themesIn(text: string): string[] {
  return Object.entries(THEME_WORDS).filter(([, re]) => re.test(text)).map(([k]) => k);
}

/** Reads "- Letter: M" and "- Theme: animals and fruits" under "## Today" in planner.md. */
export function parseToday(planner: string | null | undefined): Today | null {
  if (!planner) return null;
  const sec = planner.match(/^##[ \t]*Today\b[^\n]*\n([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/im)?.[1];
  if (!sec) return null;
  const letterText = sec.match(/^[ \t]*[-*]?[ \t]*Letter[ \t]*:[ \t]*(.+)$/im)?.[1]?.trim() ?? "";
  const letter = letterText.match(/^([A-Za-z])(?![A-Za-z])/)?.[1]?.toUpperCase() ?? null;
  const themeText = sec.match(/^[ \t]*[-*]?[ \t]*Theme[ \t]*:[ \t]*(.+)$/im)?.[1] ?? "";
  const themes = themesIn(themeText);
  return letter || themes.length ? { letter, themes } : null;
}

/**
 * Keeps `onChange` up to date with today's topic: the latest planner row now, then every new planner
 * version (a parent asking for mangoes). Returns the stop function. A failure keeps the last topic.
 */
export function watchToday(onChange: (t: Today | null) => void): () => void {
  let dead = false;
  const sb = supabaseBrowser();
  void (async () => {
    try {
      const { data } = await sb
        .from("agent_files")
        .select("content")
        .eq("child_id", CHILD_ID)
        .eq("name", "planner")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!dead && data?.content) onChange(parseToday(data.content));
    } catch {
      // no topic: keep the last one
    }
  })();
  const ch = sb
    .channel(`today:${CHILD_ID}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_files", filter: `child_id=eq.${CHILD_ID}` }, (p) => {
      const row = p.new as { name?: string; content?: string };
      if (!dead && row?.name === "planner") onChange(parseToday(row.content));
    })
    .subscribe();
  return () => {
    dead = true;
    void sb.removeChannel(ch);
  };
}

function pick<T>(xs: T[]): T | undefined {
  return xs.length ? xs[Math.floor(Math.random() * xs.length)] : undefined;
}

export class WaitPicker {
  private lastReaction: string | null = null;

  reaction(): AudioEntry | undefined {
    const all = REACTION_IDS.map(audioById).filter((e): e is AudioEntry => !!e);
    const e = pick(all.filter((x) => x.id !== this.lastReaction)) ?? all[0];
    if (e) this.lastReaction = e.id;
    return e;
  }
}
