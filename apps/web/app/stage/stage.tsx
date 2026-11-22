"use client";
// /stage (REFINE R1): one screen for the demo. Left, Nani's world: the wall, Nani's face and the paw docked at the
// bottom, a caption, and a text box for Aarav's line. Right, the parents' world: R4's band, then the group chat.
//
// One audio path: this page's toy core (useToy) owns every sound; the wall plays nothing. The core emits every wall
// event on the in-page bus for this page's <Wall>, and still broadcasts on wall:<child> for a projector.
// Everything one half needs from the other goes through the server (calls, clips, chat) or the bus (the wall),
// because a page never hears its own client-side broadcasts.
import { useCallback, useEffect, useRef, useState } from "react";
import { GuidanceChat } from "@/components/chat/guidance-chat";
import { saveSender } from "@/components/chat/ui";
import Wall from "@/components/wall/Wall";
import { createWallBus } from "@/lib/wall-bus";
import { callLabel } from "../toy/call-bar";
import { NaniFace } from "../toy/face";
import { PawButton } from "../toy/paw";
import { isTextBox, useToy } from "../toy/use-toy";
import { PresenterDrawer, usePresenter, type Notify } from "./drawer";
import "./stage.css";
import { StageTopBand } from "./top-band";
import { WhoSwitch, type StageParent } from "./who-switch";

// The chat's call panel is portaled to <body> as a full-window sheet. On the stage it covers the right half only,
// so the paw (left half) stays tappable during a call.
const CALL_SHEET_CSS = `body > div[role="dialog"][aria-modal="true"][aria-label^="Call with"] { left: 50% !important; }`;

interface Toast {
  text: string;
  bad?: boolean;
  key: number;
}

export function Stage() {
  const [bus] = useState(createWallBus);
  const toy = useToy({ bus });
  const { core, call } = toy;

  const [who, setWho] = useState<StageParent>("Mumma");
  // The chat's call bubble joins as the device's saved name: keep it in step with the switch.
  useEffect(() => saveSender(who), [who]);

  // ---------- toasts (presenter feedback, "Ready") ----------
  const [toast, setToast] = useState<Toast | null>(null);
  const toastSeq = useRef(0);
  const notify = useCallback<Notify>((text, opts) => {
    const key = ++toastSeq.current;
    setToast({ text, bad: opts?.bad, key });
    setTimeout(() => setToast((t) => (t?.key === key ? null : t)), opts?.ms ?? 2600);
  }, []);

  const presenter = usePresenter(notify);
  const [drawer, setDrawer] = useState(false);

  // ---------- shortcuts (never while a text box has focus; event.code, since Option changes event.key on a Mac) ----------
  const actionsRef = useRef(presenter.actions);
  useEffect(() => {
    actionsRef.current = presenter.actions;
  });
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat || isTextBox(document.activeElement)) return;
      const a = actionsRef.current;
      const map: Record<string, () => void> = {
        Digit2: () => void a.add2h(),
        KeyF: () => void a.fireNext(),
        KeyR: () => void a.reset(),
        KeyP: () => setDrawer((d) => !d),
      };
      const f = map[e.code];
      if (!f) return;
      e.preventDefault();
      f();
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, []);

  // ---------- the first tap anywhere unlocks sound and the mic ----------
  const wakeRef = useRef(toy.wake);
  useEffect(() => {
    wakeRef.current = toy.wake;
  });
  useEffect(() => {
    if (core.awake) return;
    const w = () => {
      // A bare Alt, Ctrl or Cmd press is not a user gesture: waking then leaves the AudioContext suspended
      // and every later tap stuck behind the "waking" guard. Wait for a real gesture (a click, or Alt+P's P).
      if (navigator.userActivation && !navigator.userActivation.isActive) return;
      wakeRef.current();
    };
    window.addEventListener("pointerdown", w, true);
    window.addEventListener("keydown", w, true);
    return () => {
      window.removeEventListener("pointerdown", w, true);
      window.removeEventListener("keydown", w, true);
    };
  }, [core.awake]);

  // ---------- Aarav's typed line (the "mic fails" fallback) ----------
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inCall = !!call.call;

  // ---------- caption: what Aarav said, then the sentence Nani is saying ----------
  const caption = inCall
    ? { who: "", text: callLabel(call.call!) }
    : toy.naniSaying
      ? { who: "Nani", text: toy.naniSaying }
      : toy.heard
        ? { who: "Aarav", text: toy.heard }
        : null;

  const pawLabel = toy.listening
    ? "Listening… tap to send"
    : core.awake && toy.mic === "pending"
      ? "Allow the microphone…"
      : toy.mic === "blocked"
        ? "Mic blocked: type below"
        : inCall
          ? `Tap to talk to ${call.call!.who === "papa" ? "Papa" : "Mumma"}`
          : "Tap to talk";

  return (
    <main className="stg-stage">
      <style>{CALL_SHEET_CSS}</style>

      {/* ---------- left: Nani's world ---------- */}
      <section className="stg-left" aria-label="Nani's world">
        <div className="stg-wall-box">
          <Wall bus={bus} contained />
        </div>

        <div className="stg-dock">
          <div className="stg-face">
            <NaniFace eyes={core.awake ? core.eyes : "offline"} fill />
          </div>
          <div className="stg-paw-col">
            <PawButton listening={toy.listening} onTap={toy.tap} className="stg-paw" />
            <span className="stg-paw-label" data-on={toy.listening} aria-live="polite">
              {pawLabel}
            </span>
          </div>
          <div className="stg-talk-col">
            <p className="stg-caption" data-who={caption?.who || undefined} aria-live="polite">
              {caption ? (
                <>
                  {caption.who && <span className="stg-caption-who">{caption.who}</span>}
                  {caption.who ? `“${caption.text}”` : caption.text}
                </>
              ) : (
                <span className="stg-caption-idle">Nani is ready</span>
              )}
            </p>
            {inCall ? (
              <button type="button" className="stg-end-call" onClick={() => call.end("tap")}>
                End call
              </button>
            ) : (
              <form
                className="stg-type-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = draft.trim();
                  if (!text) return;
                  toy.say(text);
                  setDraft("");
                  inputRef.current?.blur(); // so the space bar taps the paw again
                }}
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={core.micError ? `${core.micError}: type Aarav's line` : "Type Aarav's line"}
                  className="stg-type-input"
                  aria-label="Aarav's line"
                />
                <button className="stg-type-send" disabled={!draft.trim()}>
                  Say
                </button>
              </form>
            )}
          </div>
          <button type="button" className="stg-handle" onClick={() => setDrawer((d) => !d)} aria-label="Presenter controls (Alt+P)" title="Presenter (⌥P)">
            ⋯
          </button>
        </div>

        {!core.awake && (
          <button type="button" className="stg-wake" onClick={() => toy.wake()}>
            <span className="stg-wake-face">
              <NaniFace eyes="offline" fill />
            </span>
            <span className="stg-wake-pill">Tap to wake Nani</span>
            <span className="stg-wake-hint">Turns on sound and the microphone</span>
          </button>
        )}
      </section>

      {/* ---------- right: the parents' world ---------- */}
      <section className="stg-right" aria-label="The parents' group chat">
        <StageTopBand />
        <div className="stg-chat">
          <GuidanceChat sender={who} fill headerSlot={<WhoSwitch value={who} onChange={setWho} />} />
        </div>
      </section>

      <PresenterDrawer p={presenter} open={drawer} onClose={() => setDrawer(false)} />

      {toast && (
        <div key={toast.key} className="stg-toast" data-bad={toast.bad || undefined} role="status">
          {toast.text}
        </div>
      )}
    </main>
  );
}
