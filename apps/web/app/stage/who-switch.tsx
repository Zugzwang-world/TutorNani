"use client";
// Who is typing in the stage's chat: Mumma (default) or Papa. Lives in the chat header's slot.
import "./stage.css";

export type StageParent = "Mumma" | "Papa";
const PARENTS: StageParent[] = ["Mumma", "Papa"];

export function WhoSwitch({ value, onChange }: { value: StageParent; onChange: (p: StageParent) => void }) {
  return (
    <div className="stg-who" role="radiogroup" aria-label="Typing as">
      {PARENTS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          data-on={value === p}
          className="stg-who-btn"
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
