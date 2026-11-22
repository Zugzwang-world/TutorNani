"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { BOTS, type BotInfo, type FileName, type Message } from "@/lib/types";
import { BotAvatar, ParentAvatar } from "./avatar";
import { CallBubble } from "./call-bubble";
import { openProfile, ProfileHost } from "./profile";
import { ProgressCard, ReportHost } from "@/components/report";
import { SayButton } from "./say-button";
import { botOf, dayKey, dayLabel, timeLabel, toneOf } from "./ui";
import type { Pending, Row } from "./use-chat";
import type { TypingSlot } from "./use-typing";
import { VoicePlayer } from "./voice-player";

export interface WhatChangedTarget {
  file: FileName;
  toVersion: number;
  changedLines?: string[];
  removedLines?: string[];
}

type Item =
  | { t: "day"; key: string; label: string }
  | { t: "msg"; key: string; row: Row; first: boolean }
  | { t: "pending"; key: string; p: Pending; first: boolean };

const GROUP_MS = 5 * 60_000;

// Presentation memory for this page (one chat per page):
// your own messages already shown as pending bubbles, so the saved copy doesn't pop in a second time,
const sentHere = new Set<string>();
// and replies that took over their typing bubble, so their avatar and name stay still and only the bubble turns into text.
const morphed = new Set<number>();

const same = (a: string, b: string | null) => !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function buildItems(rows: Row[], pending: Pending[]): Item[] {
  const out: Item[] = [];
  let lastDay = "";
  let lastSender = "";
  let lastAt = 0;
  const push = (sender: string, at: string, make: (first: boolean) => Item) => {
    const d = dayKey(at);
    if (d !== lastDay) {
      out.push({ t: "day", key: `day-${d}`, label: dayLabel(at) });
      lastDay = d;
      lastSender = "";
    }
    const ts = new Date(at).getTime();
    const first = sender !== lastSender || ts - lastAt > GROUP_MS;
    out.push(make(first));
    lastSender = sender;
    lastAt = ts;
  };
  for (const r of rows) {
    const k = typeof r.meta?.clientId === "string" ? r.meta.clientId : `m${r.id}`;
    const grouping = r.meta?.kind === "call" ? `${r.sender}#call${r.id}` : r.sender;
    push(grouping, r.created_at, (first) => ({ t: "msg", key: k, row: r, first }));
  }
  for (const p of pending) push(p.sender, p.createdAt, (first) => ({ t: "pending", key: p.clientId, p, first }));
  return out;
}

// ---------- bubbles ----------

function Time({ iso, children }: { iso?: string; children?: ReactNode }) {
  return (
    <span className="pointer-events-none absolute right-3 bottom-1.5 flex items-center gap-1 text-[11px] leading-none text-muted/90 tabular-nums">
      {iso ? timeLabel(iso) : null}
      {children}
    </span>
  );
}

const SPACER = <span aria-hidden className="inline-block w-[4.2rem]" />;

function Tag({ bot, children }: { bot: BotInfo | null; children: ReactNode }) {
  const t = bot ? toneOf(bot) : null;
  return (
    <span
      className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold tracking-wide uppercase ${
        t ? `${t.soft} ${t.text}` : "bg-line text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function bubbleShape(side: "left" | "right", first: boolean) {
  const base = "relative rounded-[22px] px-3.5 pt-2 pb-2";
  if (side === "right") return `${base} ${first ? "rounded-tr-md" : ""} border border-marigold/25 bg-marigold-soft`;
  return `${base} ${first ? "rounded-tl-md" : ""} border border-line bg-paper shadow-[0_1px_0_rgba(43,33,24,0.04)]`;
}

function MessageBody({
  row,
  bot,
  mine,
  first,
  localAudio,
}: {
  row: Message;
  bot: BotInfo | null;
  mine: boolean;
  first: boolean;
  localAudio?: string;
}) {
  const kind = row.meta?.kind;
  if (kind === "call") return <CallBubble message={row} />;

  const voice = kind === "voice" || ((kind === "call_clip" || !bot) && !!row.audio_url);
  const text = voice ? (typeof row.meta?.transcript === "string" && row.meta.transcript) || row.text : row.text;
  const isNani = row.sender === "nani";

  return (
    <div className={bubbleShape(mine ? "right" : "left", first)}>
      {(kind === "note" || kind === "event") && <Tag bot={bot}>from playtime</Tag>}
      {kind === "brief" && <Tag bot={bot}>Evening brief</Tag>}
      {voice && <VoicePlayer src={localAudio ?? row.audio_url} mine={mine} />}
      {text ? (
        <p className={`text-base leading-[1.4] break-words whitespace-pre-wrap ${voice ? "mt-1" : ""}`}>
          {text}
          {!isNani && SPACER}
        </p>
      ) : (
        !isNani && <span className="block h-3">{SPACER}</span>
      )}
      {isNani && text && (
        <div className="pr-16">
          <SayButton text={text} />
        </div>
      )}
      <Time iso={row.created_at} />
    </div>
  );
}

function LeftRow({
  first,
  avatar,
  name,
  nameClass,
  children,
  below,
  fresh,
  morph,
  onProfile,
}: {
  first: boolean;
  avatar: ReactNode;
  name: string;
  nameClass: string;
  children: ReactNode;
  below?: ReactNode;
  fresh?: boolean;
  morph?: boolean;
  /** An agent's row: tapping its avatar or name opens that agent's profile. */
  onProfile?: () => void;
}) {
  return (
    <Grow on={!!fresh && !morph}>
      <div className={`flex items-start gap-2 ${first ? "pt-3" : "pt-1"} ${fresh && !morph ? "tg-enter tg-origin-left" : ""}`}>
        <div className="w-8 shrink-0">
          {first && onProfile ? (
            <button type="button" onClick={onProfile} aria-label={`Open profile: ${name}`} className="tg-press block rounded-full">
              {avatar}
            </button>
          ) : first ? (
            avatar
          ) : null}
        </div>
        <div className="flex max-w-[82%] min-w-0 flex-col items-start">
          {first &&
            (onProfile ? (
              <button type="button" onClick={onProfile} aria-label={`Open profile: ${name}`} className={`mb-0.5 ml-1 text-[13px] font-extrabold hover:underline ${nameClass}`}>
                {name}
              </button>
            ) : (
              <span className={`mb-0.5 ml-1 text-[13px] font-extrabold ${nameClass}`}>{name}</span>
            ))}
          {morph ? <div className="tg-morph-in max-w-full">{children}</div> : children}
          {below && morph ? <div className="tg-morph-in tg-morph-late">{below}</div> : below}
        </div>
      </div>
    </Grow>
  );
}

function RightRow({ first, children, below, fresh }: { first: boolean; children: ReactNode; below?: ReactNode; fresh?: boolean }) {
  return (
    <Grow on={!!fresh}>
      <div className={`flex justify-end ${first ? "pt-3" : "pt-1"} ${fresh ? "tg-enter tg-origin-right" : ""}`}>
        <div className="flex max-w-[82%] min-w-0 flex-col items-end">
          {children}
          {below}
        </div>
      </div>
    </Grow>
  );
}

/** A new row opens up its own height, so the chat glides up instead of jumping. */
function Grow({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div className={on ? "tg-grow" : undefined}>
      <div>{children}</div>
    </div>
  );
}

/** Animates its own height when the content's height changes (a transcript arriving under a voice note). */
function AutoHeight({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    let h = i.offsetHeight;
    const ro = new ResizeObserver(() => {
      const nh = i.offsetHeight;
      if (nh === h) return;
      const from = h;
      h = nh;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      o.animate([{ height: `${from}px` }, { height: `${nh}px` }], { duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
    });
    ro.observe(i);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="overflow-hidden">
      <div ref={inner}>{children}</div>
    </div>
  );
}

function WhatChangedLink({ bot, onOpen }: { bot: BotInfo; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`tg-press mt-1 ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[13px] font-bold ${toneOf(bot).text} hover:underline`}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="opacity-80">
        <path
          d="M4 1.5h5.2L13 5.3V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V3a1.5 1.5 0 0 1 1-1.5Z M9 1.8V5.5h3.7 M6 9h4 M8 7v4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      what changed
    </button>
  );
}

function MessageRow({
  row,
  first,
  me,
  localAudio,
  morph,
  onWhatChanged,
}: {
  row: Row;
  first: boolean;
  me: string | null;
  localAudio?: string;
  morph?: boolean;
  onWhatChanged: (t: WhatChangedTarget) => void;
}) {
  const bot = botOf(row.sender);
  if (!bot && row.sender_kind === "system") {
    return (
      <div className={`mt-3 flex justify-center ${row.fresh ? "tg-enter" : ""}`}>
        <span className="max-w-[85%] rounded-full bg-line/60 px-3 py-1 text-center text-[13px] text-muted">{row.text}</span>
      </div>
    );
  }
  const mine = !bot && same(row.sender, me);
  const body = <MessageBody row={row} bot={bot} mine={mine} first={first} localAudio={localAudio} />;

  if (mine) {
    return (
      <RightRow first={first} fresh={row.fresh}>
        {body}
      </RightRow>
    );
  }
  if (bot) {
    const m = row.meta ?? {};
    const canDiff = !!m.file && typeof m.toVersion === "number";
    return (
      <LeftRow
        first={first}
        fresh={row.fresh}
        morph={morph}
        avatar={<BotAvatar bot={bot} size={32} />}
        name={bot.name}
        nameClass={toneOf(bot).text}
        onProfile={() => openProfile(bot.key)}
        below={
          canDiff || m.progress ? (
            <>
              {canDiff ? (
                <WhatChangedLink
                  bot={bot}
                  onOpen={() =>
                    onWhatChanged({
                      file: m.file as FileName,
                      toVersion: m.toVersion as number,
                      changedLines: Array.isArray(m.changedLines) ? m.changedLines : undefined,
                      removedLines: Array.isArray(m.removedLines) ? (m.removedLines as string[]) : undefined,
                    })
                  }
                />
              ) : null}
              {m.progress ? <ProgressCard view={m.progress.view} warm={!!row.fresh} /> : null}
            </>
          ) : null
        }
      >
        {body}
      </LeftRow>
    );
  }
  return (
    <LeftRow first={first} fresh={row.fresh} avatar={<ParentAvatar name={row.sender} size={32} />} name={row.sender} nameClass="text-ink/70">
      {body}
    </LeftRow>
  );
}

function PendingRow({ p, first, localAudio, onRetry }: { p: Pending; first: boolean; localAudio?: string; onRetry: (id: string) => void }) {
  const failed = p.status === "failed";
  return (
    <RightRow
      first={first}
      fresh
      below={
        failed ? (
          <button
            type="button"
            onClick={() => onRetry(p.clientId)}
            className="tg-press mt-1 mr-1 inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[13px] font-bold text-memory"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
              <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3.2h-3.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {p.error ?? "not sent"} · retry
          </button>
        ) : null
      }
    >
      <div className={`${bubbleShape("right", first)} ${failed ? "opacity-70" : ""}`}>
        {p.kind === "voice" && <VoicePlayer src={localAudio ?? null} mine />}
        {p.kind === "voice" ? (
          <AutoHeight>
            {p.text ? (
              <p key="said" className="tg-reveal mt-1 text-base leading-[1.4] break-words whitespace-pre-wrap">
                {p.text}
                {SPACER}
              </p>
            ) : (
              <p key="wait" className="mt-1 text-base leading-[1.4]">
                <span className={p.status === "transcribing" ? "tg-shimmer font-semibold" : "text-muted"}>
                  {p.status === "transcribing" ? "Writing it down…" : "Voice note"}
                </span>
                {SPACER}
              </p>
            )}
          </AutoHeight>
        ) : (
          <p className="text-base leading-[1.4] break-words whitespace-pre-wrap">
            {p.text}
            {SPACER}
          </p>
        )}
        <Time iso={p.createdAt}>
          {!failed && (
            <svg width="12" height="12" viewBox="0 0 16 16" aria-label="sending" className="text-muted">
              <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 4.6V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </Time>
      </div>
    </RightRow>
  );
}

/** The one "typing…" bubble, laid out exactly like the reply that replaces it (same avatar, name and corner). */
function TypingRow({ slot, first }: { slot: TypingSlot; first: boolean }) {
  const bot = BOTS[slot.bot];
  const t = toneOf(bot);
  return (
    <div className="tg-collapse tg-grow" data-open={slot.phase !== "out"} data-typing={slot.bot}>
      <div>
        <div className={`tg-enter tg-origin-left flex items-start gap-2 ${first ? "pt-3" : "pt-1"}`}>
          <div className="w-8 shrink-0">{first ? <BotAvatar bot={bot} size={32} /> : null}</div>
          <div className="flex min-w-0 flex-col items-start">
            {first && <span className={`mb-0.5 ml-1 text-[13px] font-extrabold ${t.text}`}>{bot.name}</span>}
            <div
              className={`flex h-[42px] items-center rounded-[22px] border border-line bg-paper px-4 shadow-[0_1px_0_rgba(43,33,24,0.04)] ${first ? "rounded-tl-md" : ""}`}
              role="status"
              aria-label={`${bot.name} is typing`}
            >
              <span className={`tg-dots flex items-center gap-[5px] ${t.text}`}>
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessageList({
  rows,
  pending,
  typing,
  landedId,
  me,
  localAudio,
  onWhatChanged,
  onRetry,
  footer,
}: {
  rows: Row[];
  pending: Pending[];
  typing: TypingSlot | null;
  landedId: number | null;
  me: string | null;
  localAudio: Record<string, string>;
  onWhatChanged: (t: WhatChangedTarget) => void;
  onRetry: (clientId: string) => void;
  footer?: ReactNode;
}) {
  for (const p of pending) sentHere.add(p.clientId);
  if (landedId != null) morphed.add(landedId);

  const items = buildItems(rows, pending);
  const last = items[items.length - 1];
  const lastSender = last?.t === "msg" ? last.row.sender : last?.t === "pending" ? last.p.sender : "";
  const lastAt = last?.t === "msg" ? last.row.created_at : last?.t === "pending" ? last.p.createdAt : "";
  // Same rule as buildItems, so the typing bubble and the reply that replaces it agree on showing the avatar.
  const typingFirst = !!typing && (lastSender !== typing.bot || !lastAt || typing.since - new Date(lastAt).getTime() > GROUP_MS);
  return (
    <div className="mx-auto w-full max-w-[640px] px-3 pt-2 pb-3">
      {items.map((it) => {
        if (it.t === "day")
          return (
            <div key={it.key} className="mt-3 flex justify-center">
              <span className="rounded-full border border-line/70 bg-cream/95 px-3 py-0.5 text-[12px] font-bold text-muted shadow-[0_1px_2px_rgba(43,33,24,0.05)]">
                {it.label}
              </span>
            </div>
          );
        if (it.t === "msg") {
          const cid = typeof it.row.meta?.clientId === "string" ? it.row.meta.clientId : "";
          const row = it.row.fresh && cid && sentHere.has(cid) ? { ...it.row, fresh: false } : it.row;
          return (
            <MessageRow
              key={it.key}
              row={row}
              first={it.first}
              me={me}
              localAudio={cid ? localAudio[cid] : undefined}
              morph={morphed.has(it.row.id)}
              onWhatChanged={onWhatChanged}
            />
          );
        }
        return <PendingRow key={it.key} p={it.p} first={it.first} localAudio={localAudio[it.p.clientId]} onRetry={onRetry} />;
      })}
      {typing && <TypingRow key={`typing-${typing.n}`} slot={typing} first={typingFirst} />}
      {footer}
      <ProfileHost />
      <ReportHost />
    </div>
  );
}
