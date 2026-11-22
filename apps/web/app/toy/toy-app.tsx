"use client";
// /toy, the toy stand-in (PLAN.md C1, C2; R1): Nani's face, a big paw (tap to talk, tap again to send, or the
// space bar), and the speaker for everything Nani says. The wiring (talk, call, routine, taps) is useToy, shared
// with /stage.
import { useState, useSyncExternalStore } from "react";
import { NaniFace } from "./face";
import { CallBar, callLabel } from "./call-bar";
import { PawButton } from "./paw";
import { useToy } from "./use-toy";
import type { EyeState } from "./use-toy-core";

const LABEL: Record<EyeState, string> = {
  idle: "Tap the paw and talk to Nani",
  listening: "Listening… tap to send",
  thinking: "Nani is thinking…",
  speaking: "Nani is talking",
  calling: "Calling…",
  offline: "Nani is resting (offline)",
};

const noSubscribe = () => () => {};

export function ToyApp() {
  const toy = useToy();
  const { core, call, stats: st } = toy;
  const [draft, setDraft] = useState("");

  // ?type shows a text box (testing, or a backup if the microphone fails on stage).
  const typeParam = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).has("type"),
    () => false,
  );
  const showTyping = typeParam || !!core.micError;

  const timing = [
    st.reactionMs !== undefined && `reaction ${st.reactionMs} ms`,
    st.firstVoiceMs !== undefined && `voice ${st.firstVoiceMs} ms`,
    st.server && `stt ${st.server.stt} · brain ${st.server.brainFirst} · tts ${st.server.voiceFirst} · total ${st.server.total}`,
    st.fallback && `fallback ${st.fallback}`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <main className="fixed inset-0 flex select-none flex-col items-center justify-between bg-cream px-4 pb-6 pt-8 text-ink">
      <p className="rounded-full bg-paper/80 px-5 py-2 text-lg font-semibold text-muted shadow-sm" aria-live="polite">
        {call.call ? callLabel(call.call) : toy.listening ? LABEL.listening : LABEL[core.eyes]}
      </p>

      <NaniFace eyes={core.eyes} />

      <div className="flex w-full max-w-md flex-col items-center gap-3">
        {showTyping && (
          <form
            className="flex w-full gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (core.mode !== "talk") return;
              toy.say(draft);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={core.micError ? `${core.micError}: type to Nani` : "Type what Aarav says"}
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 text-base outline-none focus:border-marigold"
            />
            <button className="rounded-full bg-marigold px-4 py-2 font-bold text-paper">Say</button>
          </form>
        )}

        <PawButton listening={toy.listening} onTap={toy.tap} className="h-44 w-44 sm:h-52 sm:w-52" />
        {call.call ? (
          <CallBar call={call.call} onEnd={() => call.end("tap")} />
        ) : (
          <p className="text-sm text-muted">
            {toy.listening
              ? "Listening… tap to send"
              : core.awake && toy.mic === "pending"
                ? "Allow the microphone…"
                : "Tap to talk, or press the space bar"}
          </p>
        )}
        <p className="min-h-5 text-center text-xs text-muted/80">
          {st.heard !== undefined && <span>heard “{st.heard}”  ·  </span>}
          {timing}
        </p>
      </div>

      {!core.awake && (
        <button
          type="button"
          onClick={() => toy.wake()}
          className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-marigold-soft/95 text-ink"
        >
          <NaniFace eyes="offline" />
          <span className="rounded-full bg-marigold px-8 py-4 text-2xl font-extrabold text-paper shadow-lg">Tap to wake Nani</span>
        </button>
      )}
    </main>
  );
}
