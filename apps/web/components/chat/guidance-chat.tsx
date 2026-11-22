"use client";
// The parent's group chat with Nani's five agents (PLAN.md B4).
import "./chat.css";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BubbleStage } from "./bubbles/bubble-stage";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageList, type WhatChangedTarget } from "./message-list";
import { readSender, saveSender } from "./ui";
import { useChat } from "./use-chat";
import { useTyping } from "./use-typing";
import { WhatChangedSheet } from "./what-changed-sheet";
import { WhoIsThis } from "./who-is-this";

// This device's sender name (localStorage tg_sender), read without touching it during prerender.
const SERVER = "\u0000server";
let memSender: string | null = null; // fallback when storage is blocked
const senderSubs = new Set<() => void>();
function subscribeSender(cb: () => void) {
  senderSubs.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    senderSubs.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const senderSnapshot = () => readSender() ?? memSender ?? "";
const serverSnapshot = () => SERVER;

/**
 * `sender`: a fixed sender (the stage's Mumma/Papa switch). It skips "Who's this?" and localStorage.
 * `fill`: fill the parent's height instead of the window's (the stage's right half).
 * `headerSlot`: extra controls at the right of the chat header (the stage's Mumma/Papa switch).
 */
export function GuidanceChat({ sender: fixedSender, fill = false, headerSlot }: { sender?: string; fill?: boolean; headerSlot?: ReactNode } = {}) {
  // Everything that reads the device (localStorage, time) happens after hydration, so the prerendered shell is static.
  const stored = useSyncExternalStore(subscribeSender, senderSnapshot, serverSnapshot);
  const ready = fixedSender ? true : stored !== SERVER;
  const sender = fixedSender ?? (ready && stored ? stored : null);
  const { rows, pending, working, loaded, localAudio, sendText, sendVoice, retry } = useChat(sender);
  const { typing, landedId } = useTyping(working, rows);
  const [sheet, setSheet] = useState<WhatChangedTarget | null>(null);
  const [newCount, setNewCount] = useState(0);
  const showNew = newCount > 0;

  const scroller = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const stuck = useRef(true);
  const lastKey = useRef<string>("");

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    stuck.current = true;
    setNewCount(0);
    if (smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  }, []);

  // Stay pinned to the bottom while content grows (new bubbles, typing rows, images, keyboard).
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const ro = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new message while scrolled up shows a "new messages" pill (with a count) instead of yanking the view.
  useEffect(() => {
    const last = pending.length ? pending[pending.length - 1].clientId : rows.length ? `m${rows[rows.length - 1].id}` : "";
    if (last && lastKey.current && last !== lastKey.current && !stuck.current) setNewCount((n) => n + 1);
    lastKey.current = last;
  }, [rows, pending]);

  // Only the user's own scrolling (wheel, touch, keys, scrollbar) unpins the view; layout shifts never do.
  const userAt = useRef(0);
  const markUser = () => {
    userAt.current = Date.now();
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) stuck.current = true;
    else if (Date.now() - userAt.current < 1200) stuck.current = false;
    if (stuck.current && showNew) setNewCount(0);
  };

  const pick = (name: string) => {
    memSender = name;
    saveSender(name);
    senderSubs.forEach((cb) => cb());
    requestAnimationFrame(() => toBottom(true));
  };

  const askWho = ready && loaded && !sender;

  return (
    <div className={`tg-gc flex ${fill ? "h-full min-h-0" : "h-dvh"} w-full flex-col bg-cream`}>
      <BubbleStage rows={rows} pending={pending} loaded={loaded} onSend={sendText}>
        <div className="tg-col">
          <ChatHeader sender={sender} working={working} slot={headerSlot} />

          <div
            ref={scroller}
            onScroll={onScroll}
            onWheel={markUser}
            onTouchMove={markUser}
            onPointerDown={markUser}
            onKeyDown={markUser}
            className="relative flex-1 overflow-y-auto overscroll-contain"
          >
            <div ref={content}>
              {!loaded && (
                <div className="flex justify-center pt-16" aria-label="Loading chat">
                  <span className="tg-dots flex gap-1.5 text-muted">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              )}
              {loaded && (
                <MessageList
                  rows={rows}
                  pending={pending}
                  typing={typing}
                  landedId={landedId}
                  me={sender}
                  localAudio={localAudio}
                  onWhatChanged={setSheet}
                  onRetry={retry}
                  footer={askWho ? <WhoIsThis onPick={pick} /> : null}
                />
              )}
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -top-14 left-1/2 z-10 -translate-x-1/2">
              <button
                type="button"
                onClick={() => toBottom(true)}
                data-on={showNew}
                className="tg-pill pointer-events-auto flex items-center gap-1.5 rounded-full border border-marigold/40 bg-paper py-2 pr-3 pl-3.5 text-[14px] font-extrabold whitespace-nowrap text-[#b86a00] shadow-[0_6px_20px_rgba(43,33,24,0.14)]"
                tabIndex={showNew ? 0 : -1}
                aria-hidden={!showNew}
              >
                {newCount > 1 ? `${newCount} new messages` : "New message"}
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M7 2.5v9M3 7.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <Composer disabled={!sender} onSendText={sendText} onSendVoice={sendVoice} onSent={() => toBottom()} />
          </div>
        </div>
      </BubbleStage>

      {sheet && <WhatChangedSheet key={`${sheet.file}-${sheet.toVersion}`} target={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
