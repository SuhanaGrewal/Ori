import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const TEAL_LIGHT = "#8FBFC9";

// "Every Monday, someone" holds; the predicate keeps rotating — one
// recurring pattern, many faces.
const PREDICATES = [
  "rebuilds the same report.",
  "re-keys the same numbers.",
  "chases the same signature.",
  "copies the same fields across.",
];

const FONT_SIZE = 40;
const SLOT_HEIGHT = 60;

// bare rotating line — the parent places it (e.g. pinned at the top of the
// Why scene). No positioning of its own.
export default function ProblemStatement() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setI((p) => (p + 1) % PREDICATES.length), 2600);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      {/* the recurring pattern, cycling */}
      <div style={{ display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
        <span
          style={{
            height: SLOT_HEIGHT,
            display: "inline-flex",
            alignItems: "center",
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: FONT_SIZE,
            color: INK,
          }}
        >
          Every Monday, someone&nbsp;
        </span>

        {/* rotating predicate — italic, light teal, cycling upward */}
        <span style={{ position: "relative", height: SLOT_HEIGHT, width: 500, overflow: "hidden" }}>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={i}
              initial={{ y: 44, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -44, opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                fontFamily: SERIF,
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: FONT_SIZE,
                color: TEAL_LIGHT,
              }}
            >
              {PREDICATES[i]}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      {/* printed-caption rule, like FIG. 01 under the hero wordmark — rule then caption, left-aligned */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, paddingLeft: 4 }}>
        <div style={{ width: 64, height: 1, background: "rgba(27,27,24,0.22)" }} />
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_SOFT }}>
          FIG. 02 — THE PROBLEM
        </span>
      </div>
    </div>
  );
}
