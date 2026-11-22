// The sorter (PLAN.md B5): one fast JSON brain call that picks the agents, their edits and their replies. Server-only.
// The reply is streamed: each action is handed over as soon as its JSON object closes, so the first agent can
// answer while the brain is still writing the next one.
import { z } from "zod";
import { brainStreamRetry } from "../brain";
import { clockParts } from "../clock";
import { supabaseAdmin } from "../supabase/server";
import { BOT_KEYS, type BotKey, type Turn } from "../types";
import { systemPrompt, userPrompt, type SorterInput } from "./prompt";

const BOT_ALIASES: Record<string, BotKey> = {
  nani: "nani",
  routine: "routine",
  rules: "rules",
  "house rules": "rules",
  house_rules: "rules",
  lessons: "lessons",
  memory: "memory",
};
const toBot = (v: unknown) => (typeof v === "string" ? (BOT_ALIASES[v.trim().toLowerCase()] ?? v) : v);

/** Drops a stock opener ("Done! ", "Got it, ", "Noted. ") so replies lead with the substance; keeps a reply that is only that. */
const STOCK_OPENER = /^(?:done|got it|noted|okay|ok|sure)\s*[!.,:–—-]+\s*/i;
function freshOpener(reply: string): string {
  const rest = reply.replace(STOCK_OPENER, "");
  if (rest === reply || !/[\p{L}\p{N}]/u.test(rest)) return reply;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

const MAX_WORDS = 30; // the prompt asks for 25; past 30 the reply keeps only its first whole sentences
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Sentences, never split inside "quoted" or 'quoted' words; a trailing emoji stays with its sentence. */
function sentences(text: string): string[] {
  const ch = Array.from(text); // code points, so an emoji is one item
  const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c);
  const isEmoji = (c: string | undefined) => !!c && /[\p{Extended_Pictographic}️‍]/u.test(c);
  const out: string[] = [];
  let start = 0;
  let dq = false; // inside "…" or “…”
  let sq = false; // inside '…' (an apostrophe inside a word is not a quote)
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (c === '"' || c === "“" || c === "”") dq = c === "“" ? true : c === "”" ? false : !dq;
    else if (c === "'" && !sq && !isLetter(ch[i - 1]) && isLetter(ch[i + 1])) sq = true;
    else if (c === "'" && sq && !isLetter(ch[i + 1])) sq = false;
    const end = /[.!?]/.test(c) || (isEmoji(c) && /\s/.test(ch[i + 1] ?? ""));
    if (dq || sq || !end) continue;
    let j = i + 1;
    while (j < ch.length && (/\s/.test(ch[j]) || isEmoji(ch[j]))) j++;
    if (j === i + 1 || j >= ch.length || !/[\p{Lu}\p{N}"“']/u.test(ch[j])) continue; // mid-sentence, or the end
    out.push(ch.slice(start, j).join("").trim());
    start = j;
  }
  out.push(ch.slice(start).join("").trim());
  return out.filter(Boolean);
}

/** One tidy chat line: no stock opener, and a runaway reply cut back to its first whole sentences. */
export function tidyReply(reply: string): string {
  const text = freshOpener(reply);
  if (words(text) <= MAX_WORDS) return text;
  const kept: string[] = [];
  for (const s of sentences(text)) {
    if (kept.length && words([...kept, s].join(" ")) > MAX_WORDS) break;
    kept.push(s);
  }
  return kept.join(" ");
}

const ActionSchema = z.object({
  bot: z.preprocess(toBot, z.enum(["nani", "routine", "rules", "lessons", "memory"])),
  kind: z.string().catch("chat"),
  // add/remove lines (fast: the model never re-types the section); a full newSection is still accepted.
  edit: z
    .object({
      section: z.string(),
      add: z.array(z.string()).optional().catch(undefined),
      remove: z.array(z.string()).optional().catch(undefined),
      newSection: z.string().optional().catch(undefined),
    })
    .nullable()
    .catch(null),
  reply: z.string().trim().min(1).transform(tidyReply),
});

export type SorterAction = z.infer<typeof ActionSchema>;
export type SorterEvent = { type: "bots"; bots: BotKey[] } | { type: "action"; action: SorterAction };

function validAction(item: unknown): SorterAction | null {
  const r = ActionSchema.safeParse(item);
  if (r.success) return r.data;
  console.warn(`[chat] skipped action: ${JSON.stringify(item).slice(0, 200)}`);
  return null;
}

/**
 * Incremental reader for {"bots":[...],"actions":[{...},{...}]}: returns each action object as soon as it closes.
 * String-aware, so braces inside replies are ignored.
 */
class ActionScanner {
  private buf = "";
  private pos = -1; // scan position inside the actions array; -1 until "actions": [ is seen
  private depth = 0;
  private inStr = false;
  private esc = false;
  private objStart = -1;
  bots: BotKey[] | null = null;
  done = false;

  push(delta: string): unknown[] {
    this.buf += delta;
    if (!this.bots) {
      const m = this.buf.match(/"bots"\s*:\s*(\[[^\]]*\])/);
      if (m) {
        try {
          const list = (JSON.parse(m[1]) as unknown[]).map(toBot).filter((b): b is BotKey => BOT_KEYS.includes(b as BotKey));
          this.bots = [...new Set(list)];
        } catch {
          this.bots = [];
        }
      }
    }
    if (this.pos < 0) {
      const m = /"actions"\s*:\s*\[/.exec(this.buf);
      if (!m) return [];
      this.pos = m.index + m[0].length;
    }
    const out: unknown[] = [];
    for (; this.pos < this.buf.length && !this.done; this.pos++) {
      const c = this.buf[this.pos];
      if (this.inStr) {
        if (this.esc) this.esc = false;
        else if (c === "\\") this.esc = true;
        else if (c === '"') this.inStr = false;
        continue;
      }
      if (c === '"') this.inStr = true;
      else if (c === "{" || c === "[") {
        if (this.depth === 0 && c === "{") this.objStart = this.pos;
        this.depth++;
      } else if (c === "}" || c === "]") {
        if (this.depth === 0 && c === "]") {
          this.done = true;
          break;
        }
        this.depth--;
        if (this.depth === 0 && c === "}" && this.objStart >= 0) {
          try {
            out.push(JSON.parse(this.buf.slice(this.objStart, this.pos + 1)));
          } catch {
            console.warn(`[chat] unparsable action: ${this.buf.slice(this.objStart, this.pos + 1).slice(0, 200)}`);
          }
          this.objStart = -1;
        }
      }
    }
    return out;
  }

  text(): string {
    return this.buf.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  }
}

/**
 * One streamed brain call. Yields the planned bots (when the model lists them) and each valid action as it closes.
 * Throws if the reply holds no usable action, so the caller can retry.
 */
export async function* sortStream(input: SorterInput): AsyncGenerator<SorterEvent> {
  const scanner = new ActionScanner();
  let sentBots = false;
  let count = 0;
  const stream = brainStreamRetry({
    retryAfterMs: 4000,
    messages: [
      { role: "system", content: systemPrompt(input.now.dayLabel) },
      { role: "user", content: userPrompt(input) },
    ],
    json: true,
    maxTokens: 1200,
    signal: AbortSignal.timeout(25_000),
  });
  for await (const delta of stream) {
    const items = scanner.push(delta);
    if (!sentBots && scanner.bots) {
      sentBots = true;
      if (scanner.bots.length) yield { type: "bots", bots: scanner.bots };
    }
    for (const item of items) {
      const a = validAction(item);
      if (a && count < 4) {
        count++;
        yield { type: "action", action: a };
      }
    }
  }
  if (count) return;
  // The model may have used another shape (e.g. a bare array): parse the whole reply once.
  let raw: unknown;
  try {
    raw = JSON.parse(scanner.text());
  } catch {
    throw new Error(`sorter: invalid JSON: ${scanner.text().slice(0, 200)}`);
  }
  const list = Array.isArray(raw) ? raw : (raw as { actions?: unknown })?.actions;
  const actions = (Array.isArray(list) ? list : []).map(validAction).filter((a): a is SorterAction => !!a).slice(0, 4);
  if (!actions.length) throw new Error(`sorter: no valid actions: ${scanner.text().slice(0, 200)}`);
  for (const a of actions) yield { type: "action", action: a };
}

/** Today's turns (India time, real clock), oldest first, at most `limit`. Empty on error. */
export async function todaysTurns(
  child: string,
  limit = 15,
): Promise<Pick<Turn, "kind" | "child_text" | "nani_text" | "created_at">[]> {
  const now = new Date();
  const start = new Date(now.getTime() - clockParts(now).minutes * 60_000 - (now.getTime() % 60_000));
  const { data, error } = await supabaseAdmin()
    .from("turns")
    .select("kind, child_text, nani_text, created_at")
    .eq("child_id", child)
    .gte("created_at", start.toISOString())
    .order("id", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn(`[chat] turns: ${error.message}`);
    return [];
  }
  return (data as Pick<Turn, "kind" | "child_text" | "nani_text" | "created_at">[]).reverse();
}

/** Day label for the day after `now` in India, e.g. "18 Nov". */
export function tomorrowLabel(now: Date): string {
  return clockParts(new Date(now.getTime() + 24 * 3600_000)).dayLabel;
}
