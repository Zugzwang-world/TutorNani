"use client";
// What /toy and /stage show during a call (N2): the status line and a big, clear End button.
import { whoLabel } from "@/lib/call/shared";
import type { ToyCall } from "./use-call";

export function callLabel(c: ToyCall): string {
  const name = whoLabel(c.who);
  if (c.recording) return `${name} will hear you…`;
  if (c.hearing) return `${name} is talking`;
  if (c.sending) return `Sending to ${name}…`;
  return c.state === "open" ? `On a call with ${name} 📞` : `Calling ${name}…`;
}

export function CallBar({ call, onEnd }: { call: ToyCall; onEnd: () => void }) {
  return (
    <>
      <p className="text-sm text-muted">{call.recording ? "Listening… tap to send" : `Tap the paw to talk to ${whoLabel(call.who)}`}</p>
      <button
        type="button"
        onClick={onEnd}
        aria-label="End the call"
        className="flex items-center gap-2 rounded-full bg-[#d64545] px-8 py-3 text-xl font-extrabold text-white shadow-lg active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <path
            fill="currentColor"
            d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.77 7.46 7 12 7s8.66 1.77 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z"
          />
        </svg>
        End call
      </button>
    </>
  );
}
