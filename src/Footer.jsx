import React, { useState } from "react";
import { motion } from "framer-motion";
import craneLogo from "./assets/crane-logo-slate.svg";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const ACCENT = "#5C8A94";

const RULE = "rgba(27,27,24,0.14)";

function ColumnHeading({ children }) {
  return (
    <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_SOFT, opacity: 0.7, margin: "0 0 14px" }}>
      {children}
    </p>
  );
}

export default function Footer() {
  const [hover, setHover] = useState(false);

  return (
    <footer style={{ position: "relative", background: "transparent", padding: "0 64px 56px" }}>
      {/* the sheet's closing rule */}
      <div style={{ height: 1, background: RULE, marginBottom: 44 }} />

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 64,
          flexWrap: "wrap",
        }}
      >
        {/* mark + closing line */}
        <div style={{ maxWidth: 380 }}>
          <motion.img
            src={craneLogo}
            alt="Ori"
            animate={{ rotate: [0, -2.4, 1.2, 0], scale: [1, 1.03, 0.99, 1] }}
            transition={{ duration: 1.6, times: [0, 0.4, 0.75, 1], ease: "easeInOut", repeat: Infinity, repeatDelay: 11 }}
            style={{ width: 52, height: 52, transformOrigin: "50% 90%", display: "block", marginBottom: 18 }}
          />

          <p style={{ fontFamily: SERIF, fontSize: 22, color: INK, lineHeight: 1.35, margin: 0 }}>
            <span style={{ display: "block" }}>The company brain.</span>
            <span style={{ display: "block" }}>
              <em style={{ fontStyle: "italic", color: ACCENT }}>And hands.</em>
            </span>
          </p>
        </div>

        {/* get in touch */}
        <div>
          <ColumnHeading>GET IN TOUCH</ColumnHeading>
          <p style={{ fontFamily: BODY, fontSize: 14, color: INK_SOFT, lineHeight: 1.65, margin: "0 0 18px", maxWidth: 260 }}>
            Ori will diagnose, build and maintain the solutions for your team.
          </p>
          <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              display: "inline-block",
              fontFamily: BODY,
              fontWeight: 500,
              fontSize: 14.5,
              color: "#FBF9F4",
              background: hover ? "#547E88" : ACCENT,
              padding: "10px 24px",
              borderRadius: 999,
              cursor: "pointer",
              boxShadow: hover
                ? "0 5px 8px -2px rgba(27,27,24,0.18), 0 16px 24px -14px rgba(27,27,24,0.30)"
                : "0 2px 4px -1px rgba(27,27,24,0.16), 0 10px 16px -10px rgba(27,27,24,0.22)",
              transition: "background 0.2s ease, box-shadow 0.25s ease",
            }}
          >
            Get in Touch
          </div>
        </div>
      </div>

      {/* the drafting-sheet title block, closing the page out */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          marginTop: 56,
          paddingTop: 18,
          borderTop: `1px solid ${RULE}`,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_SOFT, opacity: 0.8 }}>
          © {new Date().getFullYear()} ORI
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_SOFT, opacity: 0.55 }}>
          DRAWN TO SCALE · SHEET 1 OF 1
        </span>
      </div>
    </footer>
  );
}
