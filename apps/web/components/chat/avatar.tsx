import type { BotInfo } from "@/lib/types";
import { toneOf } from "./ui";

/** Round agent avatar: emoji on the agent's soft colour. */
export function BotAvatar({ bot, size = 32, className = "" }: { bot: BotInfo; size?: number; className?: string }) {
  const t = toneOf(bot);
  return (
    <span
      aria-hidden
      className={`emoji inline-flex shrink-0 items-center justify-center rounded-full ${t.soft} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
    >
      {bot.emoji}
    </span>
  );
}

/** Round parent avatar: first letter of their name. */
export function ParentAvatar({ name, size = 32, className = "" }: { name: string | null; size?: number; className?: string }) {
  const letter = name?.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-ink/85 font-extrabold text-cream ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
    >
      {letter}
    </span>
  );
}
