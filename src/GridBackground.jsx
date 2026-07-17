import React, { useEffect, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const INK_SOFT = "#6E6C62";

// page-level paper grain — same noise family as the card faces, subtler
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.08'/%3E%3C/svg%3E\")";

const GRID = [
  "linear-gradient(rgba(27,27,24,0.05) 1px, transparent 1px)",
  "linear-gradient(90deg, rgba(27,27,24,0.05) 1px, transparent 1px)",
  "linear-gradient(rgba(27,27,24,0.028) 1px, transparent 1px)",
  "linear-gradient(90deg, rgba(27,27,24,0.028) 1px, transparent 1px)",
].join(", ");

// one continuous surface behind hero -> problem statement -> Why. The camera
// eases closer as you scroll (scale), drifts diagonally at rest, and every
// 8-12s a single faint crease hand-draws itself somewhere quiet, then fades.
export default function GridBackground({ targetRef }) {
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);

  const [crease, setCrease] = useState(null);

  useEffect(() => {
    let alive = true;
    let t;
    const schedule = (delay) => {
      t = setTimeout(() => {
        if (!alive) return;
        const x1 = 6 + Math.random() * 34;
        const y1 = 12 + Math.random() * 56;
        const run = 28 + Math.random() * 42;
        const rise = (Math.random() < 0.5 ? 1 : -1) * (14 + Math.random() * 26);
        setCrease({
          id: Date.now(),
          x1,
          y1,
          x2: Math.min(96, x1 + run),
          y2: Math.max(4, Math.min(96, y1 + rise)),
        });
        schedule(5000 + Math.random() * 3000);
      }, delay);
    };
    schedule(1200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN }} />

      <motion.div
        animate={{ x: [0, 14, 3, -11, 0], y: [0, -10, 4, 12, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "absolute", inset: -60 }}
      >
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            scale,
            transformOrigin: "50% 22%",
            backgroundImage: GRID,
            backgroundSize: "280px 280px, 280px 280px, 56px 56px, 56px 56px",
          }}
        />
      </motion.div>

      {crease && (
        <svg
          key={crease.id}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <motion.line
            x1={crease.x1}
            y1={crease.y1}
            x2={crease.x2}
            y2={crease.y2}
            pathLength="1"
            stroke={INK_SOFT}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0, opacity: 0.17 }}
            animate={{ pathLength: 1, opacity: [0.17, 0.17, 0] }}
            transition={{
              pathLength: { duration: 2.4, ease: "easeInOut" },
              opacity: { duration: 5.2, times: [0, 0.55, 1] },
            }}
          />
        </svg>
      )}
    </div>
  );
}
