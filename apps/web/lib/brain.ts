// The live brain, chosen by `brain.provider` in content/demo.config.json (server-only).
// Kimi: OpenAI-style API, thinking off. k2.6 fixes temperature at 0.6 when thinking is off, so it is not sent.
import { brainSettings } from "./config";

export interface BrainMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainOptions {
  messages: BrainMessage[];
  json?: boolean; // JSON mode: reply is one JSON object
  maxTokens?: number;
  temperature?: number; // ignored for Kimi k2.6 (fixed)
  signal?: AbortSignal;
}

function key(envName: string): string {
  const k = process.env[envName];
  if (!k) throw new Error(`${envName} missing`);
  return k.replace(/^["']|["']$/g, "");
}

function kimiBody(o: BrainOptions, stream: boolean) {
  const s = brainSettings();
  return {
    model: s.model,
    messages: o.messages,
    max_tokens: o.maxTokens ?? 400,
    stream,
    ...(s.thinking === "off" ? { thinking: { type: "disabled" } } : {}),
    ...(o.json ? { response_format: { type: "json_object" } } : {}),
  };
}

function anthropicBody(o: BrainOptions, stream: boolean) {
  const s = brainSettings();
  const system = o.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = o.messages.filter((m) => m.role !== "system");
  return {
    model: s.model,
    max_tokens: o.maxTokens ?? 400,
    stream,
    ...(system ? { system: o.json ? `${system}\n\nReply only with one JSON object.` : system } : {}),
    messages,
    ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
  };
}

async function call(o: BrainOptions, stream: boolean): Promise<Response> {
  const s = brainSettings();
  let res: Response;
  if (s.provider === "kimi") {
    res = await fetch(`${s.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key(s.keyEnv)}`, "Content-Type": "application/json" },
      body: JSON.stringify(kimiBody(o, stream)),
      signal: o.signal,
    });
  } else {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key(s.keyEnv), "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify(anthropicBody(o, stream)),
      signal: o.signal,
    });
  }
  if (!res.ok) throw new Error(`brain ${s.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** One complete reply. */
export async function brainComplete(o: BrainOptions): Promise<{ text: string; finishReason: string; ms: number }> {
  const t0 = Date.now();
  const res = await call(o, false);
  const j = await res.json();
  if (brainSettings().provider === "kimi") {
    return { text: j.choices?.[0]?.message?.content ?? "", finishReason: j.choices?.[0]?.finish_reason ?? "", ms: Date.now() - t0 };
  }
  const text = (j.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  return { text, finishReason: j.stop_reason ?? "", ms: Date.now() - t0 };
}

/** JSON mode helper: parses the reply; throws on invalid JSON. */
export async function brainJson<T = unknown>(o: Omit<BrainOptions, "json">): Promise<T> {
  const r = await brainComplete({ ...o, json: true });
  const text = r.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(text) as T;
}

/** Streams text deltas as they arrive. */
export async function* brainStream(o: BrainOptions): AsyncGenerator<string> {
  const provider = brainSettings().provider;
  const res = await call(o, true);
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
        const j = JSON.parse(data);
        if (provider === "kimi") {
          const d = j.choices?.[0]?.delta?.content;
          if (d) yield d as string;
        } else if (j.type === "content_block_delta" && j.delta?.type === "text_delta") {
          yield j.delta.text as string;
        } else if (j.type === "message_stop") {
          return;
        }
      } catch {
        // ignore keep-alives and partial lines
      }
    }
  }
}

/**
 * Like brainStream, but if no first token arrives within `retryAfterMs`, that request is cancelled and ONE
 * fresh request starts (never two in flight: Kimi throttles parallel requests). Kimi k2.6 stalls ~10% of
 * requests for 7–10 s; a fresh request usually answers in ~1 s (probe 17 Nov: 2 stalls in 20, retry 1.9 s).
 */
export async function* brainStreamRetry(o: BrainOptions & { retryAfterMs: number; attempts?: number }): AsyncGenerator<string> {
  type Leg = { ac: AbortController; it: AsyncIterator<string> };
  const outer = o.signal;
  const start = (): Leg => {
    const ac = new AbortController();
    if (outer) {
      if (outer.aborted) ac.abort();
      else outer.addEventListener("abort", () => ac.abort(), { once: true });
    }
    return { ac, it: brainStream({ ...o, signal: ac.signal })[Symbol.asyncIterator]() };
  };

  const attempts = Math.max(1, o.attempts ?? 2);
  let leg = start();
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
    console.warn(early === "retry" ? `[brain] no first token in ${o.retryAfterMs} ms (attempt ${n}), retrying` : `[brain] attempt ${n} failed, retrying: ${(early.err as Error)?.message}`);
    leg = start();
  }
  if (res && !res.done) yield res.value;
  while (true) {
    const next = await leg.it.next();
    if (next.done) return;
    yield next.value;
  }
}
