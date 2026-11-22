"use client";
// One idea bubble: a small infographic (scene, parent, situation, line, the agents it reaches and their files).
import { useState, type CSSProperties } from "react";
import { BOTS, type Bubble } from "@/lib/types";
import { BotAvatar, ParentAvatar } from "../avatar";
import { toneOf } from "../ui";

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** "👨‍💼🚗🏠" -> ["👨‍💼", "🚗", "🏠"] (keeps joined emoji together). */
function pieces(scene: string): string[] {
  const list = segmenter ? Array.from(segmenter.segment(scene), (s) => s.segment) : Array.from(scene);
  return list.filter((s) => s.trim()).slice(0, 4);
}

// Where each emoji sits in the scene: [left %, top %, size, tilt]. The middle one is the star.
const LAYOUTS: Record<number, [number, number, number, number][]> = {
  1: [[50, 52, 1.25, 0]],
  2: [
    [34, 56, 1, -7],
    [68, 50, 0.9, 7],
  ],
  3: [
    [22, 60, 0.7, -10],
    [50, 48, 1.15, 0],
    [79, 60, 0.7, 10],
  ],
  4: [
    [18, 62, 0.62, -10],
    [40, 48, 1, -3],
    [63, 52, 0.85, 4],
    [84, 62, 0.62, 10],
  ],
};

export function BubbleCard({
  bubble,
  index,
  side,
  next,
  onPick,
}: {
  bubble: Bubble;
  index: number;
  side: "left" | "right";
  next: boolean;
  onPick: (b: Bubble, el: HTMLElement) => void;
}) {
  const [sent, setSent] = useState(false);
  const first = BOTS[bubble.agents[0]] ?? BOTS.nani;
  const items = pieces(bubble.scene);
  const layout = LAYOUTS[Math.min(items.length, 4)] ?? LAYOUTS[1];
  const vars = {
    "--bt": `var(--color-${first.color})`,
    "--bs": `var(--color-${first.color}-soft)`,
    "--dur": `${5.2 + ((index * 7) % 5) * 0.55}s`,
    "--delay": `${-(index * 1.3) % 5}s`,
  } as CSSProperties;

  return (
    <div className="tg-slot" data-side={side} style={{ "--i": index } as CSSProperties}>
      <div className="tg-float" style={vars}>
        <button
          type="button"
          className="tg-bub"
          data-next={next}
          data-sent={sent}
          aria-label={`${bubble.parent}, ${bubble.situation}: ${bubble.line}`}
          onClick={(e) => {
            if (sent) return;
            setSent(true);
            setTimeout(() => setSent(false), 1200); // a bubble that stays on screen can be used again
            onPick(bubble, e.currentTarget);
          }}
        >
          <span className="tg-scene" aria-hidden>
            {image(bubble) ?? (
              <>
                <span className="tg-scene-dot tg-scene-dot-a" />
                <span className="tg-scene-dot tg-scene-dot-b" />
                {items.map((e, i) => {
                  const [x, y, s, r] = layout[i] ?? layout[layout.length - 1];
                  return (
                    <span
                      key={i}
                      className="tg-scene-emoji emoji"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        fontSize: `calc(var(--tg-emoji) * ${s})`,
                        transform: `translate(-50%, -50%) rotate(${r}deg)`,
                      }}
                    >
                      {e}
                    </span>
                  );
                })}
              </>
            )}
          </span>
          <span className="tg-who">
            <ParentAvatar name={bubble.parent} size={26} className="ring-2 ring-paper" />
            <span className="tg-who-name">{bubble.parent}</span>
          </span>
          <span className="tg-sit">{bubble.situation}</span>
          <span className="tg-say">&ldquo;{bubble.line}&rdquo;</span>
          <span className="tg-reach">
            {bubble.agents.map((k) => {
              const bot = BOTS[k];
              return (
                <span key={k} className="tg-chip" title={`${bot.name} · ${bot.file}.md`}>
                  <BotAvatar bot={bot} size={22} />
                  <span className={`tg-chip-file ${toneOf(bot).text}`}>{bot.file}.md</span>
                </span>
              );
            })}
          </span>
        </button>
      </div>
    </div>
  );
}

function image(b: Bubble) {
  // eslint-disable-next-line @next/next/no-img-element
  return b.image ? <img src={b.image} alt="" className="tg-scene-img" draggable={false} /> : null;
}
