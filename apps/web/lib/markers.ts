// Nani's wall and note markers (PLAN.md C4, B8). Pure; safe on client and server.
import { BOT_KEYS, type BotKey, type Cue, type Note } from "./types";

const MARKER_RE = /\[\[([^\[\]]*?)\]\]/g;

/** Emojis in a string: split on spaces, then on grapheme clusters ("⭐🌟" -> ["⭐", "🌟"]). */
function emojisIn(s: string): string[] {
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  return s
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) => (seg ? [...seg.segment(t)].map((x) => x.segment) : [t]))
    .filter((t) => /\p{Extended_Pictographic}/u.test(t));
}

/** Parse one marker body (the text between [[ and ]]). Returns a cue, a note, or null if invalid. */
export function parseMarker(body: string): { cue?: Cue; note?: Note } | null {
  const s = body.trim();
  const m = s.match(/^(\w+)\s*([\s\S]*)$/);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const rest = m[2].trim();
  const parts = rest.split(/\s+/).filter(Boolean);

  switch (kind) {
    case "show": {
      // [[show 🌙 Moon]] or [[show 🌙 Moon | chand | ⭐ 🌟]]: everything after the first | is optional (R6.4)
      const [head, hindi, extras] = rest.split("|").map((x) => x.trim());
      const hp = head.split(/\s+/).filter(Boolean);
      if (hp.length < 2) return null;
      const cue: Cue = { type: "show", emoji: hp[0], word: hp.slice(1).join(" ") };
      if (hindi) cue.hindi = hindi;
      const ex = extras ? emojisIn(extras).slice(0, 2) : [];
      if (ex.length) cue.extras = ex;
      return { cue };
    }
    case "spell": {
      // [[spell MANGO 1 M S T]]
      if (parts.length < 3) return null;
      const word = parts[0].toUpperCase();
      const gap = parseInt(parts[1], 10);
      if (!Number.isFinite(gap) || gap < 1 || gap > word.length) return null;
      const tiles = parts.slice(2, 5).map((t) => t.toUpperCase());
      return { cue: { type: "spell", word, gap, tiles } };
    }
    case "tile": {
      if (parts.length < 2) return null;
      const result = parts[1].toLowerCase();
      if (result !== "right" && result !== "wrong") return null;
      return { cue: { type: "tile", letter: parts[0].toUpperCase(), result } };
    }
    case "count": {
      // [[count 🥭 1+1]] or [[count ⭐ 3]]; a trailing "both" counts in Hindi and English (R6.5)
      if (parts.length < 2) return null;
      const both = parts.length > 2 && parts[parts.length - 1].toLowerCase() === "both";
      const expr = (both ? parts.slice(1, -1) : parts.slice(1)).join("");
      const sum = expr.match(/^(\d+)\+(\d+)$/);
      const n = expr.match(/^(\d+)$/);
      if (!sum && !n) return null;
      const cue: Cue = sum ? { type: "count", emoji: parts[0], a: +sum[1], b: +sum[2] } : { type: "count", emoji: parts[0], a: +n![1] };
      if (both) cue.both = true;
      return { cue };
    }
    case "choices": {
      // [[choices 🎵 Song, 🔤 Letters, 🔢 Count]]
      const items = rest
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
          const [emoji, ...label] = x.split(/\s+/);
          return { emoji, label: label.join(" ") };
        })
        .filter((x) => x.emoji && x.label)
        .slice(0, 4);
      if (items.length < 2) return null;
      return { cue: { type: "choices", items } };
    }
    case "cheer":
      return { cue: { type: "cheer", emoji: parts[0] || "⭐" } };
    case "sound":
      if (!parts[0]) return null;
      return { cue: { type: "sound", name: parts[0].toLowerCase() } };
    case "song":
      return { cue: { type: "song" } };
    case "call": {
      const who = (parts[0] || "").toLowerCase();
      if (who !== "mumma" && who !== "papa") return null;
      return { cue: { type: "call", who } };
    }
    case "note": {
      // [[note routine: Aarav said he drank water]]
      const nm = rest.match(/^(\w+)\s*:\s*([\s\S]+)$/);
      if (!nm) return null;
      const bot = nm[1].toLowerCase() as BotKey;
      if (!BOT_KEYS.includes(bot)) return null;
      return { note: { bot, text: nm[2].trim() } };
    }
    default:
      return null;
  }
}

/** Remove every [[...]] marker (and any unfinished trailing "[[...") and tidy spaces. */
export function stripMarkers(text: string): string {
  return text
    .replace(MARKER_RE, " ")
    .replace(/\[\[[^\]]*$/, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Split a reply into speakable text, wall cues and parent notes. Invalid markers are dropped. */
export function parseMarkers(text: string): { speech: string; cues: Cue[]; notes: Note[]; invalid: string[] } {
  const cues: Cue[] = [];
  const notes: Note[] = [];
  const invalid: string[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    const r = parseMarker(m[1]);
    if (!r) invalid.push(m[0]);
    else if (r.cue) cues.push(r.cue);
    else if (r.note) notes.push(r.note);
  }
  return { speech: stripMarkers(text), cues, notes, invalid };
}

/** True if the text ends inside an unfinished marker ("... [[show 🥭"), so a streamer should wait for more. */
export function hasOpenMarker(text: string): boolean {
  const open = text.lastIndexOf("[[");
  return open >= 0 && text.indexOf("]]", open) < 0;
}

/** Render a cue back to marker text (for prompts and logs). */
export function cueToMarker(c: Cue): string {
  switch (c.type) {
    case "show": {
      const tail = c.hindi || c.extras?.length ? ` | ${c.hindi ?? ""}${c.extras?.length ? ` | ${c.extras.join(" ")}` : ""}` : "";
      return `[[show ${c.emoji} ${c.word}${tail}]]`;
    }
    case "spell": return `[[spell ${c.word} ${c.gap} ${c.tiles.join(" ")}]]`;
    case "tile": return `[[tile ${c.letter} ${c.result}]]`;
    case "count": return `[[count ${c.emoji} ${c.b !== undefined ? `${c.a}+${c.b}` : c.a}${c.both ? " both" : ""}]]`;
    case "choices": return `[[choices ${c.items.map((i) => `${i.emoji} ${i.label}`).join(", ")}]]`;
    case "cheer": return `[[cheer ${c.emoji}]]`;
    case "sound": return `[[sound ${c.name}]]`;
    case "song": return `[[song]]`;
    case "call": return `[[call ${c.who}]]`;
  }
}
