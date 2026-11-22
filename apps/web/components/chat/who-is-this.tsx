"use client";
// First visit on a device: a local Nani bubble asks who this is. Never sent to the sorter.
import { useState } from "react";
import { config } from "@/lib/config";
import { BOTS } from "@/lib/types";
import { BotAvatar } from "./avatar";
import { toneOf } from "./ui";

export function WhoIsThis({ onPick }: { onPick: (name: string) => void }) {
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const nani = BOTS.nani;
  const pick = (n: string) => {
    const v = n.trim().slice(0, 24);
    if (v) onPick(v);
  };

  return (
    <div className="tg-enter tg-origin-left mt-3 flex items-start gap-2">
      <BotAvatar bot={nani} size={32} />
      <div className="flex max-w-[86%] min-w-0 flex-col items-start">
        <span className={`mb-0.5 ml-1 text-[13px] font-extrabold ${toneOf(nani).text}`}>{nani.name}</span>
        <div className="rounded-[22px] rounded-tl-md border border-line bg-paper px-3.5 py-2.5 shadow-[0_1px_0_rgba(43,33,24,0.04)]">
          <p className="text-base leading-[1.4]">
            Namaste! <span className="emoji">🙏</span> Who&apos;s this? {config.parents.join(", ")}, or someone else?
          </p>
          {!typing ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {config.parents.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => pick(p)}
                  className="tg-press rounded-full bg-marigold px-4 py-2 text-[15px] font-extrabold text-white shadow-[0_1px_0_rgba(0,0,0,0.08)]"
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTyping(true)}
                className="tg-press rounded-full border border-marigold/50 bg-marigold-soft px-4 py-2 text-[15px] font-extrabold text-[#a65f00]"
              >
                Someone else
              </button>
            </div>
          ) : (
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                pick(name);
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name, e.g. Dadi"
                maxLength={24}
                enterKeyHint="done"
                className="min-w-0 flex-1 rounded-full border border-line bg-cream px-3.5 py-2 text-base outline-none focus:border-marigold"
              />
              <button
                type="submit"
                disabled={!name.trim()}
                className="tg-press rounded-full bg-marigold px-4 py-2 text-[15px] font-extrabold text-white disabled:opacity-40"
              >
                OK
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
