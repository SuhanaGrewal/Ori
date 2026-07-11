import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const PANEL_BG = "#C5F3FF";
const ACCENT = "#5C8A94";
const INK_SOFT = "#8B897E";

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function shadeColor(baseHex, t) {
  const [r, g, b] = hexToRgb(baseHex);
  const dark = [r * 0.55, g * 0.55, b * 0.55];
  const light = [r + (255 - r) * 0.6, g + (255 - g) * 0.6, b + (255 - b) * 0.6];
  return rgbToHex([
    dark[0] + (light[0] - dark[0]) * t,
    dark[1] + (light[1] - dark[1]) * t,
    dark[2] + (light[2] - dark[2]) * t,
  ]);
}

const SIZE = 280;
const CYCLE_DURATION = 6000;

// Four triangular panels of the square, split by its two diagonals,
// each hinged along its outer edge and rotated in real 3D space.
const PANELS = [
  { name: "north", clip: "polygon(0% 0%, 100% 0%, 50% 50%)", origin: "top", axis: "X", angle: -165, shade: 0.85 },
  { name: "east", clip: "polygon(100% 0%, 100% 100%, 50% 50%)", origin: "right", axis: "Y", angle: -35, shade: 0.55 },
  { name: "south", clip: "polygon(100% 100%, 0% 100%, 50% 50%)", origin: "bottom", axis: "X", angle: 55, shade: 0.3 },
  { name: "west", clip: "polygon(0% 100%, 0% 0%, 50% 50%)", origin: "left", axis: "Y", angle: 155, shade: 0.7 },
];

function FoldingSquare({ cycleKey }) {
  return (
    <div
      key={cycleKey}
      style={{ width: SIZE, height: SIZE, position: "relative", perspective: 900 }}
    >
      {/* crease lines, drawn on a flat backing square, fade out once folding starts */}
      <motion.svg
        width={SIZE} height={SIZE}
        style={{ position: "absolute", top: 0, left: 0 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.4, times: [0, 0.3, 0.6, 1] }}
      >
        <line x1={0} y1={0} x2={SIZE} y2={SIZE} stroke={ACCENT} strokeWidth={1.5} opacity={0.5} />
        <line x1={SIZE} y1={0} x2={0} y2={SIZE} stroke={ACCENT} strokeWidth={1.5} opacity={0.5} />
      </motion.svg>

      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transformStyle: "preserve-3d" }}>
        {PANELS.map((p) => (
          <motion.div
            key={p.name}
            initial={{ [`rotate${p.axis}`]: 0 }}
            animate={{ [`rotate${p.axis}`]: [0, 0, p.angle] }}
            transition={{ duration: 1.1, delay: 1.0, times: [0, 0.15, 1], ease: "easeInOut" }}
            style={{
              position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
              clipPath: p.clip,
              transformOrigin: p.origin,
              background: shadeColor(ACCENT, p.shade),
              backfaceVisibility: "hidden",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CraneFoldDemo() {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setCycle((c) => c + 1), CYCLE_DURATION);
    return () => clearTimeout(t);
  }, [cycle]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: BODY }}>
      <div
        style={{
          width: 400, height: 400, background: PANEL_BG,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 20px 50px rgba(27,27,24,0.06)",
        }}
      >
        <FoldingSquare cycleKey={cycle} />
      </div>
    </div>
  );
}