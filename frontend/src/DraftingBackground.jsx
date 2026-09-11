import React from "react";
import { motion } from "framer-motion";

const INK_SOFT = "#6E6C62";
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

// a faint, slowly-moving cutting-mat / drafting surface spanning the whole
// hero → problem → why zone as one continuous backdrop. Deliberately
// near-subliminal — texture, not decoration.

const RULER_LEN = 2600;
const MINOR = 22;
const MAJOR = 110;

const GRID = [
  "linear-gradient(rgba(27,27,24,0.04) 1px, transparent 1px)",
  "linear-gradient(90deg, rgba(27,27,24,0.04) 1px, transparent 1px)",
].join(", ");

function ticks() {
  const out = [];
  for (let p = 0; p <= RULER_LEN; p += MINOR) out.push({ p, major: p % MAJOR === 0 });
  return out;
}

function HRuler({ top, drift, dur }) {
  const t = ticks();
  return (
    <motion.svg
      width={RULER_LEN}
      height={26}
      style={{ position: "absolute", top, left: 0 }}
      animate={{ x: [0, drift, 0] }}
      transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }}
    >
      {t.map(({ p, major }) => (
        <line key={p} x1={p} y1={0} x2={p} y2={major ? 13 : 6} stroke={INK_SOFT} strokeWidth={1} opacity={major ? 0.14 : 0.08} />
      ))}
      {t.filter((x) => x.major).map(({ p }) => (
        <text key={`l${p}`} x={p + 4} y={22} fontFamily={MONO} fontSize={8.5} fill={INK_SOFT} opacity={0.11}>
          {p}
        </text>
      ))}
    </motion.svg>
  );
}

function Callout({ left, top, width, label, angle = 0, delay = 0 }) {
  return (
    <motion.div
      style={{ position: "absolute", left, top, transform: `rotate(${angle}deg)` }}
      animate={{ x: [0, 8, 0, -5, 0], y: [0, -6, 0, 6, 0], opacity: [0.7, 1, 0.7] }}
      transition={{ duration: 24 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <svg width={width} height={16} style={{ display: "block" }}>
        <line x1={1} y1={8} x2={1} y2={2} stroke={INK_SOFT} strokeWidth={1} opacity={0.15} />
        <line x1={1} y1={5} x2={width - 1} y2={5} stroke={INK_SOFT} strokeWidth={1} opacity={0.12} />
        <line x1={width - 1} y1={8} x2={width - 1} y2={2} stroke={INK_SOFT} strokeWidth={1} opacity={0.15} />
      </svg>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", color: INK_SOFT, opacity: 0.15, display: "block", marginTop: 2 }}>
        {label}
      </span>
    </motion.div>
  );
}

function FloatNum({ left, top, label, delay = 0 }) {
  return (
    <motion.span
      style={{ position: "absolute", left, top, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", color: INK_SOFT }}
      animate={{ opacity: [0.08, 0.17, 0.08], y: [0, -9, 0] }}
      transition={{ duration: 17 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {label}
    </motion.span>
  );
}

export default function DraftingBackground() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {/* continuous drafting grid — static; only the measurements drift */}
      <div style={{ position: "absolute", inset: -40, backgroundImage: GRID, backgroundSize: `${MAJOR}px ${MAJOR}px` }} />

      {/* ruler strips recurring down the scroll */}
      <HRuler top="4%" drift={-MAJOR} dur={44} />
      <HRuler top="32%" drift={MAJOR} dur={58} />
      <HRuler top="60%" drift={-MAJOR} dur={50} />
      <HRuler top="86%" drift={MAJOR} dur={64} />

      {/* dimension callouts + measurements scattered across the whole zone */}
      <Callout left="16%" top="10%" width={128} label="A4 · 210mm" delay={0} />
      <Callout left="66%" top="7%" width={92} label="45°" angle={-45} delay={3} />
      <Callout left="72%" top="38%" width={150} label="2:1 scale" delay={6} />
      <Callout left="24%" top="52%" width={80} label="Ø 44" delay={2} />
      <Callout left="60%" top="72%" width={130} label="1:1 actual" delay={5} />
      <Callout left="18%" top="88%" width={96} label="90°" delay={8} />

      <FloatNum left="48%" top="5%" label="1,000×" delay={0} />
      <FloatNum left="84%" top="20%" label="52,000" delay={4} />
      <FloatNum left="12%" top="30%" label="v1.0" delay={7} />
      <FloatNum left="80%" top="54%" label="6 hrs" delay={2} />
      <FloatNum left="40%" top="66%" label="+90°" delay={9} />
      <FloatNum left="70%" top="90%" label="4%" delay={5} />
    </div>
  );
}
