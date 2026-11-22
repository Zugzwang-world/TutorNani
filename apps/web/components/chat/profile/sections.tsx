"use client";
// The six sections of an agent profile, each a small infographic made in code.
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { diffLines, removedLines } from "@/lib/files-pure";
import { BOTS, type AgentFile, type BotInfo, type BotKey } from "@/lib/types";
import agentsRaw from "../../../../../content/agents.json";
import { BotAvatar } from "../avatar";
import { botOf, dayKey, whenLabel } from "../ui";
import { FileLine } from "../what-changed-sheet";
import { realExamples, type Example } from "./use-profile";
import type { ProfileData } from "./use-profile";

interface AgentCopy {
  oneLiner: string;
  flow: { say: string; write: string; do: string };
  listen: { icon: string; title: string; text: string }[];
  examples: { who: string; before: string; after: string }[];
}
const copy = agentsRaw as unknown as { steps: string[] } & Record<BotKey, AgentCopy>;

const d = (n: number) => ({ "--d": n }) as CSSProperties;

function Card({ n, title, sub, children, delay }: { n: number; title: string; sub?: string; children: ReactNode; delay: number }) {
  return (
    <section className="pf-rise" style={d(delay)}>
      <div className="mb-2.5 flex items-baseline gap-2 px-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--pc)] text-[13px] font-extrabold text-white">{n}</span>
        <h3 className="text-[20px] leading-tight font-extrabold">{title}</h3>
        {sub && <span className="min-w-0 truncate text-[13px] font-semibold text-muted">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

// ---------- 1 · who I am ----------

export function WhoIAm({ bot, versions }: { bot: BotKey; versions: AgentFile[] | null }) {
  const info = BOTS[bot];
  const [, fileName] = info.fileLabel.split(" · ");
  const latest = versions?.length ? versions[versions.length - 1] : null;
  return (
    <section className="pf-rise relative overflow-hidden rounded-[28px] border border-[var(--pc)]/25 bg-[var(--pcs)] p-5">
      {/* soft shapes in the agent's colour */}
      <svg aria-hidden className="pf-drift pointer-events-none absolute -top-10 -right-10 text-[var(--pc)]" width="220" height="220" viewBox="0 0 220 220" fill="none">
        <circle cx="130" cy="90" r="92" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
        <circle cx="130" cy="90" r="62" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" strokeDasharray="4 8" />
        <circle cx="130" cy="90" r="32" fill="currentColor" fillOpacity="0.14" />
      </svg>
      <div className="relative flex items-center gap-4">
        <div className="relative h-[84px] w-[84px] shrink-0">
          <span aria-hidden className="pf-halo" />
          <span aria-hidden className="pf-halo" />
          <BotAvatar bot={info} size={84} className="relative bg-paper shadow-[0_6px_18px_-8px_var(--pc)] ring-4 ring-paper" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[30px] leading-none font-extrabold tracking-tight">{info.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-paper px-2.5 py-0.5 font-mono text-[13px] font-bold">{fileName}</span>
            {latest && (
              <span key={latest.id} className="pf-pop rounded-full bg-[var(--pc)] px-2.5 py-0.5 text-[13px] font-extrabold text-white">
                v{latest.version}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="relative mt-4 text-[19px] leading-snug font-semibold">{copy[bot].oneLiner}</p>
      {latest && (
        <p className="relative mt-2 text-[13px] font-semibold text-ink/60">
          {latest.version === 1 ? "No changes yet" : "Last changed"} · {whenLabel(latest.created_at)}
        </p>
      )}
    </section>
  );
}

// ---------- 2 · how I work ----------

function Node({ i, icon, label, children }: { i: number; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="pf-step flex gap-3 rounded-2xl border border-line bg-paper p-3.5" style={{ "--i": i } as CSSProperties}>
      <span className="emoji flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--pcs)] text-[20px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-extrabold tracking-wide text-muted uppercase">
          {i + 1} · {label}
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function Link({ i }: { i: number }) {
  return (
    <div aria-hidden className="pf-link" style={{ "--i": i } as CSSProperties}>
      <span className="pf-dot" style={{ "--i": i } as CSSProperties} />
    </div>
  );
}

export function HowIWork({ bot }: { bot: BotKey }) {
  const info = BOTS[bot];
  const f = copy[bot].flow;
  const [, fileName] = info.fileLabel.split(" · ");
  const steps = copy.steps;
  return (
    <div className="flex flex-col">
      <Node i={0} icon="💬" label={steps[0]}>
        <p className="w-fit max-w-full rounded-2xl rounded-tl-md border border-marigold/25 bg-marigold-soft px-3 py-1.5 text-[16px] leading-snug">{f.say}</p>
      </Node>
      <Link i={0} />
      <Node i={1} icon="📝" label={steps[1]}>
        <div className="rounded-xl border border-line bg-cream/60 p-2">
          <p className="px-1 pb-1 font-mono text-[12px] font-bold text-muted">{fileName}</p>
          <div className="space-y-1 px-1 pb-1.5" aria-hidden>
            <div className="h-1.5 w-[70%] rounded-full bg-line" />
            <div className="h-1.5 w-[48%] rounded-full bg-line" />
          </div>
          <p className="pf-write rounded-lg bg-[var(--pcs)] px-2 py-1 font-mono text-[13px] leading-snug font-semibold break-words">{f.write}</p>
        </div>
      </Node>
      <Link i={1} />
      <Node i={2} icon={BOTS.nani.emoji} label={steps[2]}>
        <p className="pf-do w-fit max-w-full rounded-2xl rounded-tl-md border border-line bg-paper px-3 py-1.5 text-[16px] leading-snug shadow-[0_1px_0_rgba(43,33,24,0.04)]">{f.do}</p>
      </Node>
    </div>
  );
}

// ---------- 3 · what I listen for ----------

export function ListenFor({ bot }: { bot: BotKey }) {
  const tiles = copy[bot].listen;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map((t, i) => (
        <div key={t.title} className="pf-rise rounded-2xl border border-line bg-paper p-3.5" style={d(i + 4)}>
          <span className="pf-bob emoji text-[34px]" style={{ "--i": i } as CSSProperties}>
            {t.icon}
          </span>
          <p className="mt-1.5 text-[16px] leading-tight font-extrabold">{t.title}</p>
          <p className="mt-0.5 text-[14px] leading-snug text-ink/70">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- 4 · examples ----------

export function Examples({ bot, data }: { bot: BotKey; data: ProfileData }) {
  const cards = useMemo(() => {
    const real: Example[] = data.versions ? realExamples(data.versions, data.messages).slice(0, 2) : [];
    const seeded: Example[] = copy[bot].examples.map((e) => ({ ...e, real: false }));
    const seen = new Set(real.map((r) => r.after.trim()));
    const rest = seeded.filter((s) => !seen.has(s.after.trim()));
    return [...real, ...rest].slice(0, 3);
  }, [bot, data.versions, data.messages]);

  return (
    <div className="space-y-2.5">
      {cards.map((c, i) => {
        const isLine = /^(- |every |daily |once )/.test(c.after) || c.after.includes("\n");
        return (
          <div key={`${c.who}-${c.after}`} className={`rounded-2xl border border-line bg-paper p-3.5 ${c.real ? "pf-fresh" : ""}`}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[13px] font-extrabold text-ink/70">{c.who}</span>
              {c.real && <span className="rounded-md bg-[var(--pc)] px-1.5 py-px text-[10px] font-extrabold tracking-wide text-white uppercase">from the chat</span>}
            </div>
            <p className="w-fit max-w-full rounded-2xl rounded-tl-md border border-marigold/25 bg-marigold-soft px-3 py-1.5 text-[16px] leading-snug whitespace-pre-wrap">{c.before}</p>
            <div aria-hidden className="pf-nudge my-1 pl-4 text-[18px] leading-none font-extrabold text-[var(--pc)]" style={{ animationDelay: `${i * -0.5}s` }}>
              ↓
            </div>
            <p
              className={`rounded-xl bg-[var(--pcs)] px-3 py-2 leading-snug whitespace-pre-wrap break-words ${
                isLine ? "font-mono text-[14px] font-semibold" : "text-[16px] font-semibold"
              }`}
            >
              {c.after}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------- 5 · my file now ----------

export function FileNow({ data }: { data: ProfileData }) {
  const { versions, failed } = data;
  const latest = versions?.length ? versions[versions.length - 1] : null;
  // "Today's new lines": what was added since the last version from an earlier day (the seed history never lights up).
  const base = useMemo(() => {
    if (!versions?.length) return null;
    const today = dayKey(new Date().toISOString());
    return [...versions].reverse().find((v) => dayKey(v.created_at) < today) ?? versions[0];
  }, [versions]);
  const added = useMemo(() => (latest && base && latest.id !== base.id ? new Set(diffLines(base.content, latest.content)) : new Set<string>()), [latest, base]);
  const box = useRef<HTMLDivElement | null>(null);

  // Bring the first new line into view when the file changes.
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>("[data-new='true']");
    if (el && box.current) box.current.scrollTop = Math.max(0, el.offsetTop - 60);
    else if (box.current) box.current.scrollTop = 0;
  }, [latest?.id]);

  if (!versions && !failed) return <p className="rounded-2xl border border-line bg-paper px-4 py-6 text-center text-muted">Opening the file…</p>;
  if (failed || !latest) return <p className="rounded-2xl border border-line bg-paper px-4 py-6 text-center text-muted">Couldn&apos;t open the file right now.</p>;

  const lines = latest.content.replace(/\r\n/g, "\n").split("\n");
  const count = lines.filter((l) => added.has(l.trim()) && !l.trim().startsWith("#")).length;
  let nth = 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-cream/60 px-3.5 py-2">
        <span className="font-mono text-[13px] font-bold text-muted">{latest.name}.md · v{latest.version}</span>
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-extrabold ${count ? "bg-marigold-soft text-[#b86a00]" : "bg-line/70 text-muted"}`}>
          {count ? `${count} new line${count > 1 ? "s" : ""} today` : "nothing new today"}
        </span>
      </div>
      <div ref={box} key={latest.id} className="relative max-h-[26rem] overflow-y-auto overscroll-contain px-2 py-2.5 text-base leading-[1.45]" style={{ "--tg-base": "450ms" } as CSSProperties}>
        {lines.map((raw, i) => {
          const l = raw.trim();
          if (!l) return <div key={i} className="h-2" />;
          const isNew = added.has(l) && !l.startsWith("#");
          return <FileLine key={i} text={l} mark={isNew ? "new" : null} i={isNew ? nth++ : 0} />;
        })}
      </div>
    </div>
  );
}

// ---------- 6 · versions ----------

function whoOf(by: string | null): { label: string; bot: BotInfo | null } {
  if (!by || by === "seed") return { label: "Starting version", bot: null };
  const b = botOf(by);
  return b ? { label: b.name, bot: b } : { label: by, bot: null };
}

export function Versions({ data }: { data: ProfileData }) {
  const { versions } = data;
  const list = useMemo(() => (versions ? [...versions].reverse() : []), [versions]);
  const firstWithChange = useMemo(() => {
    if (!versions) return null;
    for (let i = versions.length - 1; i >= 1; i--) if (diffLines(versions[i - 1].content, versions[i].content).length || removedLines(versions[i - 1].content, versions[i].content).length) return versions[i].id;
    return null;
  }, [versions]);
  const [open, setOpen] = useState<number | null | undefined>(undefined); // undefined: not chosen yet → the newest change
  const shown = open === undefined ? firstWithChange : open;
  const newest = versions?.length ? versions[versions.length - 1].id : null;

  if (!versions) return <p className="rounded-2xl border border-line bg-paper px-4 py-6 text-center text-muted">Loading versions…</p>;
  return (
    <ol className="relative">
      {list.map((v, idx) => {
        const prev = versions[versions.length - 1 - idx - 1] ?? null;
        const added = prev ? diffLines(prev.content, v.content) : [];
        const gone = prev ? removedLines(prev.content, v.content) : [];
        const can = !!prev && (added.length > 0 || gone.length > 0);
        const isOpen = shown === v.id && can;
        const who = whoOf(v.changed_by);
        const last = idx === list.length - 1;
        const summary = prev
          ? [added.length ? `${added.length} new line${added.length > 1 ? "s" : ""}` : "", gone.length ? `${gone.length} removed` : ""].filter(Boolean).join(", ") || "nothing new"
          : "the first version";
        return (
          <li key={v.id} className={`relative flex gap-3 ${v.id === newest && v.version > 1 ? "pf-fresh rounded-2xl" : ""}`}>
            {/* the rail */}
            <div className="relative flex w-6 shrink-0 flex-col items-center">
              <span className="relative mt-4 h-3.5 w-3.5 shrink-0">
                {v.id === newest && <span aria-hidden className="pf-ping" />}
                <span className={`relative block h-3.5 w-3.5 rounded-full border-[3px] border-paper ${v.id === newest ? "bg-[var(--pc)]" : "bg-ink/25"}`} style={{ boxShadow: "0 0 0 1.5px var(--color-line)" }} />
              </span>
              {!last && <span aria-hidden className="w-0.5 flex-1 bg-line" />}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <button
                type="button"
                disabled={!can}
                onClick={() => setOpen(isOpen ? null : v.id)}
                aria-expanded={isOpen}
                className="tg-press w-full rounded-2xl border border-line bg-paper px-3.5 py-2.5 text-left disabled:active:scale-100"
              >
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--pcs)] px-2 py-0.5 text-[13px] font-extrabold">v{v.version}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">
                    {who.bot && <span className="emoji mr-1">{who.bot.emoji}</span>}
                    {who.label}
                  </span>
                  {can && (
                    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}>
                      <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {whenLabel(v.created_at)} · {summary}
                </span>
                {v.change_note && <span className="mt-1 block text-[15px] leading-snug text-ink/80">“{v.change_note}”</span>}
              </button>
              <div className="tg-collapse" data-open={isOpen}>
                <div>
                  {isOpen && (
                    <div className="mt-1.5 rounded-2xl border border-line bg-paper px-2 py-2" style={{ "--tg-base": "120ms" } as CSSProperties}>
                      {gone.map((l, k) => (
                        <FileLine key={`g${k}`} text={l} mark="removed" i={k} />
                      ))}
                      {added.map((l, k) => (
                        <Fragment key={`a${k}`}>
                          <FileLine text={l} mark="new" i={gone.length + k} />
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { Card };
