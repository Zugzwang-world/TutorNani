// The live brain (server-only). BRAIN_PROVIDER (claude, anthropic or kimi) wins over `brain.provider` in
// content/demo.config.json, so a rollback is an env change plus a redeploy.
// Claude primary: Kimi is the fallback for that one call. In a stream, attempt 1 is Claude and later attempts are
// Kimi (brainStreamRetry); a failed non-stream call (error, refusal, empty reply, or bad JSON in brainJson) goes to
// Kimi once. Never two requests in flight for one call, and never a switch after the first token.
// Kimi: OpenAI-style API, thinking off. k2.6 fixes temperature at 0.6 when thinking is off, so it is not sent.
// Claude: the Anthropic SDK, thinking disabled, effort from config, no temperature (Haiku 5.5 rejects it), no SDK
// retries (they would eat the retry window).
import Anthropic from "@anthropic-ai/sdk";
import { brainSettings, type BrainProvider } from "./config";

export interface BrainMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainOptions {
  messages: BrainMessage[];
  json?: boolean; // JSON mode: reply is one JSON object
  maxTokens?: number;
  signal?: AbortSignal;
  label?: string; // caller name in the [brain] log line
}

/** Which provider served a call, and on which attempt (1 = first request). */
export interface BrainServed {
  provider: "claude" | "kimi";
  attempt: number;
}

/** The live provider: BRAIN_PROVIDER (claude or anthropic means Claude, kimi means Kimi), else the config. */
export function brainProvider(): BrainProvider {
  const env = (process.env.BRAIN_PROVIDER ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (env === "claude" || env === "anthropic") return "anthropic";
  if (env === "kimi") return "kimi";
  return brainSettings().provider;
}

const tag = (p: BrainProvider): BrainServed["provider"] => (p === "anthropic" ? "claude" : "kimi");
// Claude primary: attempt 1 on Claude, every later attempt on Kimi. Kimi primary: always Kimi (as before).
const legProvider = (primary: BrainProvider, attempt: number): BrainProvider =>
  primary === "anthropic" && attempt === 1 ? "anthropic" : "kimi";
const errText = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 300);

function key(envName: string): string {
  const k = process.env[envName];
  if (!k) throw new Error(`${envName} missing`);
  return k.replace(/^["']|["']$/g, "");
}

// ---------- Kimi (request unchanged) ----------

function kimiBody(o: BrainOptions, stream: boolean) {
  const s = brainSettings("kimi");
  return {
    model: s.model,
    messages: o.messages,
    max_tokens: o.maxTokens ?? 400,
    stream,
    ...(s.thinking === "off" ? { thinking: { type: "disabled" } } : {}),
    ...(o.json ? { response_format: { type: "json_object" } } : {}),
  };
}

async function kimiCall(o: BrainOptions, stream: boolean): Promise<Response> {
  const s = brainSettings("kimi");
  const res = await fetch(`${s.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key(s.keyEnv)}`, "Content-Type": "application/json" },
    body: JSON.stringify(kimiBody(o, stream)),
    signal: o.signal,
  });
  if (!res.ok) throw new Error(`brain kimi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function kimiComplete(o: BrainOptions): Promise<{ text: string; finishReason: string }> {
  const j = await (await kimiCall(o, false)).json();
  return { text: j.choices?.[0]?.message?.content ?? "", finishReason: j.choices?.[0]?.finish_reason ?? "" };
}

async function* kimiStream(o: BrainOptions): AsyncGenerator<string> {
  const res = await kimiCall(o, true);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const d = JSON.parse(data).choices?.[0]?.delta?.content;
        if (d) yield d as string;
      } catch {
        // ignore keep-alives and partial lines
      }
    }
  }
}

// ---------- Claude (Anthropic SDK) ----------

let claudeClient: Anthropic | null = null;
/** One client per server instance, made on the first Claude call (a Kimi-only deploy never needs the key). */
function claude(): Anthropic {
  claudeClient ??= new Anthropic({ apiKey: key(brainSettings("anthropic").keyEnv), maxRetries: 0 });
  return claudeClient;
}

function claudeBody(o: BrainOptions): Anthropic.MessageCreateParamsNonStreaming {
  const s = brainSettings("anthropic");
  const system = o.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages: Anthropic.MessageParam[] = o.messages.flatMap((m): Anthropic.MessageParam[] =>
    m.role === "user" ? [{ role: "user", content: m.content }] : m.role === "assistant" ? [{ role: "assistant", content: m.content }] : [],
  );
  return {
    model: s.model,
    max_tokens: o.maxTokens ?? 400,
    ...(system ? { system: o.json ? `${system}\n\nReply only with one JSON object.` : system } : {}),
    messages,
    ...(s.thinking === "off" ? { thinking: { type: "disabled" as const } } : {}),
    ...(s.effort ? { output_config: { effort: s.effort as NonNullable<Anthropic.OutputConfig["effort"]> } } : {}),
  };
}

async function claudeComplete(o: BrainOptions): Promise<{ text: string; finishReason: string }> {
  const m = await claude().messages.create(claudeBody(o), { signal: o.signal });
  if (m.stop_reason === "refusal") throw new Error(`claude refusal${m.stop_details?.category ? ` (${m.stop_details.category})` : ""}`);
  const text = m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  if (!text.trim()) throw new Error(`claude empty reply (${m.stop_reason})`);
  return { text, finishReason: m.stop_reason ?? "" };
}

// Raw event stream (no accumulation). An `error` event or a dropped connection throws from the loop; leaving the
// loop early (the caller stopped reading) aborts the request.
async function* claudeStream(o: BrainOptions): AsyncGenerator<string> {
  const stream = await claude().messages.create({ ...claudeBody(o), stream: true }, { signal: o.signal });
  let any = false;
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
      if (ev.delta.text) {
        any = true;
        yield ev.delta.text;
      }
    } else if (ev.type === "message_delta" && ev.delta.stop_reason === "refusal") {
      throw new Error("claude refusal");
    }
  }
  if (!any) throw new Error("claude empty reply");
}

// ---------- Public calls ----------

const completeOn = (p: BrainProvider, o: BrainOptions) => (p === "anthropic" ? claudeComplete(o) : kimiComplete(o));
const streamOn = (p: BrainProvider, o: BrainOptions) => (p === "anthropic" ? claudeStream(o) : kimiStream(o));

/** One non-stream call on the live provider; with Claude primary, a failure goes to Kimi once. Logs who served it. */
async function served<T>(o: BrainOptions, run: (p: BrainProvider) => Promise<T>): Promise<{ value: T; by: BrainServed; ms: number }> {
  const primary = brainProvider();
  const label = o.label ?? "call";
  const t0 = Date.now();
  let by: BrainServed = { provider: tag(primary), attempt: 1 };
  let value: T;
  try {
    value = await run(primary);
  } catch (e) {
    if (primary === "kimi" || o.signal?.aborted) throw e;
    console.warn(`[brain] ${label} fallback claude -> kimi (attempt 2) after ${Date.now() - t0} ms: ${errText(e)}`);
    by = { provider: "kimi", attempt: 2 };
    value = await run("kimi");
  }
  const ms = Date.now() - t0;
  console.log(`[brain] ${label} served by ${by.provider} (attempt ${by.attempt}) in ${ms} ms`);
  return { value, by, ms };
}

/** One complete reply. */
export async function brainComplete(o: BrainOptions): Promise<{ text: string; finishReason: string; ms: number } & BrainServed> {
  const r = await served(o, (p) => completeOn(p, o));
  return { ...r.value, ms: r.ms, ...r.by };
}

/** JSON mode helper: parses the reply; throws on invalid JSON. On Claude, invalid JSON also falls back to Kimi. */
export async function brainJson<T = unknown>(o: Omit<BrainOptions, "json">): Promise<T> {
  const jo: BrainOptions = { ...o, json: true };
  const r = await served(jo, async (p) => {
    const text = (await completeOn(p, jo)).text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    return JSON.parse(text) as T;
  });
  return r.value;
}

/** Streams text deltas as they arrive, from the live provider (no retry, no fallback). */
export function brainStream(o: BrainOptions): AsyncGenerator<string> {
  return streamOn(brainProvider(), o);
}

/**
 * Like brainStream, but if no first token arrives within `retryAfterMs` (or the request fails first), that request
 * is cancelled and ONE fresh request starts (never two in flight: Kimi throttles parallel requests). With Claude
 * primary, attempt 1 is Claude and later attempts are Kimi; once a token arrives the provider never changes.
 * Kimi k2.6 stalls ~10% of requests for 7–10 s; a fresh request usually answers in ~1 s (probe 17 Nov: 2 stalls in 20,
 * retry 1.9 s). `onServed` gets the provider and attempt that produced the first token.
 */
export async function* brainStreamRetry(
  o: BrainOptions & { retryAfterMs: number; attempts?: number; onServed?: (s: BrainServed) => void },
): AsyncGenerator<string> {
  type Leg = { ac: AbortController; it: AsyncIterator<string>; provider: BrainProvider; n: number };
  const outer = o.signal;
  const primary = brainProvider();
  const label = o.label ?? "stream";
  const t0 = Date.now();
  const start = (n: number): Leg => {
    const ac = new AbortController();
    if (outer) {
      if (outer.aborted) ac.abort();
      else outer.addEventListener("abort", () => ac.abort(), { once: true });
    }
    const provider = legProvider(primary, n);
    return { ac, it: streamOn(provider, { ...o, signal: ac.signal })[Symbol.asyncIterator](), provider, n };
  };

  const attempts = Math.max(1, o.attempts ?? 2);
  let leg = start(1);
  let res: IteratorResult<string> | null = null;
  for (let n = 1; n <= attempts && !res; n++) {
    const p = leg.it.next();
    p.catch(() => {});
    if (n === attempts) {
      res = await p; // last attempt: wait for it (the caller's own timeout still applies)
      break;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"retry">((r) => (timer = setTimeout(() => r("retry"), o.retryAfterMs)));
    const early = await Promise.race([p.then((r) => ({ r }), (e: unknown) => ({ err: e })), late]);
    clearTimeout(timer);
    if (early !== "retry" && "r" in early) {
      res = early.r;
      break;
    }
    if (outer?.aborted) return;
    leg.ac.abort();
    const next = legProvider(primary, n + 1);
    if (next !== leg.provider) {
      const why = early === "retry" ? `no first token in ${o.retryAfterMs} ms` : `failed: ${errText(early.err)}`;
      console.warn(`[brain] ${label} fallback ${tag(leg.provider)} -> ${tag(next)} (attempt ${n + 1}) after ${Date.now() - t0} ms: ${why}`);
    } else {
      console.warn(early === "retry" ? `[brain] no first token in ${o.retryAfterMs} ms (attempt ${n}), retrying` : `[brain] attempt ${n} failed, retrying: ${(early.err as Error)?.message}`);
    }
    leg = start(n + 1);
  }
  if (res && !res.done) {
    const by: BrainServed = { provider: tag(leg.provider), attempt: leg.n };
    console.log(`[brain] ${label} served by ${by.provider} (attempt ${by.attempt}), first token in ${Date.now() - t0} ms`);
    o.onServed?.(by);
    yield res.value;
  }
  while (true) {
    const next = await leg.it.next();
    if (next.done) return;
    yield next.value;
  }
}
