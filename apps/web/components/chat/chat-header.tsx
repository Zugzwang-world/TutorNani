"use client";
import { useState, type ReactNode } from "react";
import { BOT_KEYS, BOTS, type BotKey } from "@/lib/types";
import { BotAvatar, ParentAvatar } from "./avatar";
import { openProfile } from "./profile";
import { ProgressButton } from "@/components/report";
import { CHAT_TITLE, toneOf } from "./ui";
import { isReading, replyOrder } from "./use-typing";

function Busy({ working }: { working: BotKey[] }) {
  if (isReading(working)) return <span className="font-semibold text-[#b86a00]">Everyone&apos;s reading…</span>;
  const order = replyOrder(working);
  const name = (b: BotKey) => (
    <span key={b} className={`font-extrabold ${toneOf(BOTS[b]).text}`}>
      {BOTS[b].name}
    </span>
  );
  if (order.length === 1) return <>{name(order[0])} is writing…</>;
  if (order.length === 2)
    return (
      <>
        {name(order[0])} &amp; {name(order[1])} are writing…
      </>
    );
  return (
    <>
      {name(order[0])} &amp; {order.length - 1} more are writing…
    </>
  );
}

/** `slot`: extra controls at the right end of the header (the stage's Mumma/Papa switch). */
export function ChatHeader({ sender, working, slot }: { sender: string | null; working: BotKey[]; slot?: ReactNode }) {
  const reading = isReading(working);
  const writing = reading ? [] : replyOrder(working);
  const lead = writing[0] ?? null;
  const busy = working.length > 0;
  // Keep the last "writing…" line while it fades out.
  const [said, setSaid] = useState(working);
  if (busy && said !== working) setSaid(working);
  return (
    <header className="tg-safe-top sticky top-0 z-20 border-b border-line/80 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 py-2.5">
        <div className="relative flex shrink-0 -space-x-2" aria-label="Group members">
          {/* one quiet breath behind the whole group while the message is being read */}
          <span aria-hidden className="tg-breathe pointer-events-none absolute -inset-1.5 rounded-full bg-marigold/25" data-on={reading} />
          <ParentAvatar name={sender} size={30} className="relative z-[6] ring-2 ring-cream" />
          {BOT_KEYS.map((k, i) => {
            const bot = BOTS[k];
            const on = writing.includes(k);
            const t = toneOf(bot);
            return (
              <button
                type="button"
                key={k}
                onClick={() => openProfile(k)}
                aria-label={`Open profile: ${bot.name}`}
                className={`tg-head-avatar relative cursor-pointer rounded-full ${t.text}`}
                data-on={on}
                data-lead={k === lead}
                style={{ zIndex: 5 - i }}
                title={on ? `${bot.name} is writing…` : bot.name}
              >
                <BotAvatar bot={bot} size={30} className="ring-2 ring-cream" />
                {/* a tiny typing pill in the agent's own colour */}
                <span aria-hidden className="tg-head-typing absolute -right-1.5 -bottom-1 flex items-center gap-[2px] rounded-full bg-paper px-[3px] py-[3px] shadow-[0_0_0_1.5px_var(--color-cream),0_1px_3px_rgba(43,33,24,0.18)]">
                  <span className={t.solid} />
                  <span className={t.solid} />
                  <span className={t.solid} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] leading-tight font-extrabold tracking-tight">{CHAT_TITLE}</h1>
          <p className="relative h-[18px] text-[13px] leading-[18px] text-muted" aria-live="polite">
            <span className="tg-sub absolute inset-0 truncate" data-on={!busy}>
              You, Nani and her 4 helpers
            </span>
            <span className="tg-sub absolute inset-0 truncate text-ink/70" data-on={busy}>
              {said.length ? <Busy working={said} /> : null}
            </span>
          </p>
        </div>
        <ProgressButton />
        {slot ? <div className="flex shrink-0 items-center gap-2">{slot}</div> : null}
      </div>
    </header>
  );
}
