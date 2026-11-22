// Streaming sentence splitter for Nani's live reply (PLAN.md C2 step 4). Pure; safe on client and server.
//
// Rules:
// - A chunk ends after `. ! ? … ।` (a run of them, plus closing quotes) when whitespace or a marker follows.
// - The FIRST chunk of a reply also ends at the first comma (or dash, colon, semicolon) once 3 or more
//   words precede it, so the first clip is short and starts sooner ("Haan beta, main AI Nani hoon — …"
//   waited ~600 ms for a later comma and voiced a 54 KB first clip). Keep the 3-word floor: tiny
//   first clips garble ("Do aur do," came back "Do or do?"). Later chunks keep their commas (better prosody,
//   and they are voiced in parallel while the first one plays).
// - Never split inside an open marker ("[[show 🥭" still streaming).
// - Display markers that arrive after a sentence ("Mango! [[show 🥭 Mango]]") belong to that
//   sentence while it has not been sent yet: see `shiftLeadingMarker`.
import { parseMarker, stripMarkers } from "../markers";

const END = /[.!?…।]/;
const CLOSERS = /["'”’)\]]/;
const FIRST_BREAK = /[,—–;:]/; // where the first chunk may end early

export function wordCount(text: string): number {
  const s = stripMarkers(text).trim();
  return s ? s.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length : 0; // dashes and emoji are not words
}

/** Sound and song markers play in order on the toy, so they start the next chunk instead of trailing the last one. */
export function isAudioMarker(raw: string): boolean {
  const r = parseMarker(raw.replace(/^\[\[|\]\]$/g, ""));
  return !!r?.cue && (r.cue.type === "sound" || r.cue.type === "song");
}

export class SentenceSplitter {
  private buf = "";

  push(delta: string): void {
    this.buf += delta;
  }

  /** The next complete chunk, or null if none is ready yet. `first` enables the comma rule. */
  next(first: boolean): string | null {
    const b = this.buf;
    let i = 0;
    while (i < b.length) {
      if (b.startsWith("[[", i)) {
        const close = b.indexOf("]]", i + 2);
        if (close < 0) return null; // open marker: no split point at or after it yet
        i = close + 2;
        continue;
      }
      const ch = b[i];
      if (END.test(ch)) {
        let k = i + 1;
        while (k < b.length && (END.test(b[k]) || CLOSERS.test(b[k]))) k++;
        if (k >= b.length) return null; // can't tell yet ("2." vs "2.5"); wait for the next token
        if (/\s/.test(b[k]) || b.startsWith("[[", k)) return this.cut(k);
        i = k;
        continue;
      }
      if (first && FIRST_BREAK.test(ch) && i + 1 < b.length && /\s/.test(b[i + 1]) && wordCount(b.slice(0, i)) >= 3) {
        return this.cut(i + 1);
      }
      i++;
    }
    return null;
  }

  /**
   * If the buffer starts (after whitespace) with a complete marker that `accept` allows, remove and
   * return it. Used to attach trailing display markers to the sentence before them.
   */
  shiftLeadingMarker(accept: (raw: string) => boolean): string | null {
    const m = this.buf.match(/^\s*(\[\[[^\[\]]*?\]\])/);
    if (!m || !accept(m[1])) return null;
    this.buf = this.buf.slice(m[0].length);
    return m[1];
  }

  /** Whatever is left when the stream ends (may be only markers, or empty). */
  flush(): string {
    const rest = this.buf;
    this.buf = "";
    return rest.trim();
  }

  private cut(at: number): string {
    const s = this.buf.slice(0, at).trim();
    this.buf = this.buf.slice(at);
    return s;
  }
}
