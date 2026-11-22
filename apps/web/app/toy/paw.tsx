"use client";
// The paw (R1): tap to talk, tap again to send. One pointer handler only (touch fires pointerdown and click, and a
// toggle must not run twice); a keyboard click (Enter on the focused button, detail 0) taps too. The space bar is
// handled at window level by useToy.
import "./toy.css";

export function PawButton({ listening, onTap, className = "" }: { listening: boolean; onTap: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={listening ? "Listening. Tap to send" : "Tap to talk to Nani"}
      aria-pressed={listening}
      data-down={listening}
      className={`toy-paw flex shrink-0 items-center justify-center rounded-full bg-marigold shadow-lg ${className}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onTap();
      }}
      onClick={(e) => {
        if (e.detail === 0) onTap();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 100 100" className="h-3/5 w-3/5" aria-hidden>
        <g fill="#fff8ee">
          <ellipse cx={50} cy={64} rx={22} ry={18} />
          <ellipse cx={24} cy={40} rx={9} ry={11} />
          <ellipse cx={40} cy={26} rx={9} ry={11} />
          <ellipse cx={60} cy={26} rx={9} ry={11} />
          <ellipse cx={76} cy={40} rx={9} ry={11} />
        </g>
      </svg>
    </button>
  );
}
