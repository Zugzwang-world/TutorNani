// Nani's face: an SVG grandma with round glasses. Eye states: idle, listening, thinking, speaking, calling, offline.
import type { EyeState } from "./use-toy-core";
import "./toy.css";

const INK = "#2b2118";
const SKIN = "#f3c49c";
const HAIR = "#ece7e1";
const HAIR_SHADE = "#d9d2ca";
const FRAME = "#8a5a33";

function Eyes({ eyes }: { eyes: EyeState }) {
  if (eyes === "offline") {
    return (
      <g stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none">
        <path d="M63 106 q9 6 18 0" />
        <path d="M119 106 q9 6 18 0" />
      </g>
    );
  }
  if (eyes === "calling") {
    return (
      <g stroke={INK} strokeWidth={4.5} strokeLinecap="round" fill="none">
        <path d="M63 108 q9 -10 18 0" />
        <path d="M119 108 q9 -10 18 0" />
      </g>
    );
  }
  return (
    <g>
      {[72, 128].map((cx) => (
        <g key={cx} className="toy-eye">
          <ellipse cx={cx} cy={104} rx={7.5} ry={9.5} fill={INK} />
          <circle cx={cx + 2.5} cy={100} r={2.6} fill="#fff" />
        </g>
      ))}
    </g>
  );
}

function Mouth({ eyes }: { eyes: EyeState }) {
  if (eyes === "speaking") return <ellipse className="toy-mouth-talk" cx={100} cy={146} rx={13} ry={9} fill="#9b3b2f" />;
  if (eyes === "listening") return <ellipse cx={100} cy={146} rx={6} ry={6.5} fill="#9b3b2f" />;
  if (eyes === "thinking") return <path d="M89 146 q11 4 22 -2" stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" />;
  if (eyes === "offline") return <path d="M92 146 q8 3 16 0" stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none" />;
  return <path d="M82 140 q18 18 36 0" stroke={INK} strokeWidth={4.5} strokeLinecap="round" fill="none" />;
}

/** `fill`: fill the parent box (the stage's dock) instead of the /toy size. */
export function NaniFace({ eyes, fill = false }: { eyes: EyeState; fill?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className={fill ? `toy-face toy-face-fill` : "toy-face"} data-eyes={eyes} role="img" aria-label={`Nani is ${eyes}`}>
      {eyes === "listening" && <circle className="toy-ring" cx={100} cy={108} r={84} fill="none" stroke="#f29a0e" strokeWidth={6} />}

      {/* hair and bun */}
      <circle cx={100} cy={30} r={22} fill={HAIR_SHADE} />
      <ellipse cx={100} cy={86} rx={80} ry={66} fill={HAIR} />
      {/* ears with small gold earrings */}
      <circle cx={31} cy={112} r={11} fill={SKIN} />
      <circle cx={169} cy={112} r={11} fill={SKIN} />
      <circle cx={31} cy={126} r={3.5} fill="#f2b705" />
      <circle cx={169} cy={126} r={3.5} fill="#f2b705" />
      {/* face */}
      <ellipse cx={100} cy={114} rx={68} ry={66} fill={SKIN} />
      {/* hair parting over the forehead */}
      <path d="M36 92 Q60 46 100 52 Q140 46 164 92 Q140 66 100 68 Q60 66 36 92 Z" fill={HAIR} />
      {/* bindi */}
      <circle cx={100} cy={78} r={4.5} fill="#d6322b" />
      {/* cheeks */}
      <circle cx={58} cy={130} r={11} fill="#ef8f8f" opacity={0.35} />
      <circle cx={142} cy={130} r={11} fill="#ef8f8f" opacity={0.35} />

      <Eyes eyes={eyes} />

      {/* the chashma */}
      <g stroke={FRAME} strokeWidth={4} fill="#ffffff" fillOpacity={0.18}>
        <circle cx={72} cy={104} r={21} />
        <circle cx={128} cy={104} r={21} />
      </g>
      <path d="M93 102 q7 -5 14 0" stroke={FRAME} strokeWidth={4} fill="none" />
      {/* nose */}
      <path d="M100 112 q-5 10 1 13" stroke="#c98f68" strokeWidth={3} strokeLinecap="round" fill="none" />

      <Mouth eyes={eyes} />

      {eyes === "thinking" && (
        <g fill="#8a7a6a">
          <circle className="toy-dot" cx={150} cy={22} r={6} />
          <circle className="toy-dot" cx={168} cy={14} r={6} />
          <circle className="toy-dot" cx={186} cy={6} r={6} />
        </g>
      )}
      {eyes === "offline" && (
        <g fill="#8a7a6a" fontFamily="var(--font-nunito), sans-serif" fontWeight={800}>
          <text className="toy-zz" x={152} y={50} fontSize={20}>z</text>
          <text className="toy-zz" x={166} y={34} fontSize={14} style={{ animationDelay: "0.8s" }}>z</text>
        </g>
      )}
      {eyes === "calling" && (
        <text className={`toy-phone emoji`} x={150} y={44} fontSize={34}>
          📞
        </text>
      )}
    </svg>
  );
}
