import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import craneLogo from "./assets/crane-logo-slate.svg";
import WorkflowBuildDemo from "./WorkflowBuildDemo";
import { getCurrentUser } from "./auth/realAuth";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const FONT_IMPORT = `@import url('https://fonts.cdnfonts.com/css/cmu-serif'); @import url('https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;1,400&display=swap');`;

const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const ACCENT = "#5C8A94";

// rounded blue button — system-sans label to match the nav links
function TicketButton({ children }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
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
      {children}
    </div>
  );
}

function NavBar() {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 48px",
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(251,249,244,0.82)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(27,27,24,0.07)",
        boxShadow: "0 12px 32px -24px rgba(27,27,24,0.35)",
      }}
    >
      <motion.img
        src={craneLogo}
        alt="Ori"
        animate={{ rotate: [0, -2.4, 1.2, 0], scale: [1, 1.03, 0.99, 1] }}
        transition={{ duration: 1.6, times: [0, 0.4, 0.75, 1], ease: "easeInOut", repeat: Infinity, repeatDelay: 11 }}
        style={{ width: 50, height: 50, transformOrigin: "50% 90%" }}
      />

      <Link to={getCurrentUser() ? "/dashboard" : "/login"} style={{ textDecoration: "none" }}>
        <TicketButton>Try it</TicketButton>
      </Link>
    </div>
  );
}

// print-proof crop mark — an L in one corner, inset from the edge with a gap
function CropMark({ corner }) {
  const len = 18;
  const off = 26;
  const s = { position: "absolute", background: "transparent", pointerEvents: "none" };
  const arm = `1px solid rgba(27,27,24,0.22)`;
  const pos = {
    tl: { top: off, left: off, borderTop: arm, borderLeft: arm },
    tr: { top: off, right: off, borderTop: arm, borderRight: arm },
    bl: { bottom: off, left: off, borderBottom: arm, borderLeft: arm },
    br: { bottom: off, right: off, borderBottom: arm, borderRight: arm },
  }[corner];
  return <div style={{ ...s, width: len, height: len, ...pos }} />;
}

export default function LandingPageWithDemo() {
  return (
    <div
      style={{
        position: "relative",
        background: "transparent",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: BODY,
        paddingTop: 66,
      }}
    >
      <style>{FONT_IMPORT}</style>
      <NavBar />

      {/* crop marks at the page corners */}
      <CropMark corner="tl" />
      <CropMark corner="tr" />
      <CropMark corner="bl" />
      <CropMark corner="br" />

      <div
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 48px", position: "relative", zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 90, maxWidth: 1200, width: "100%", flexWrap: "wrap",
            transform: "translateX(-40px)",
          }}
        >
          <div style={{ position: "relative", flex: "0 0 auto", transform: "translateX(-28px)" }}>
            {/* single faint diagonal crease behind the wordmark */}
            <svg
              width={640}
              height={420}
              viewBox="0 0 640 420"
              style={{ position: "absolute", left: -40, top: -30, pointerEvents: "none" }}
            >
              <line x1={-20} y1={400} x2={600} y2={40} stroke={INK} strokeWidth={1} opacity={0.06} />
              <line x1={-20} y1={406} x2={600} y2={46} stroke={INK} strokeWidth={1} opacity={0.03} />
            </svg>

            <div style={{ position: "relative" }}>
              {/* monospace eyebrow */}
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: "0.24em",
                  color: INK_SOFT,
                  marginBottom: 18,
                  paddingLeft: 4,
                }}
              >
                STAY ON TOP OF IT WITH
              </div>

              <h1
                style={{
                  fontFamily: SERIF, fontWeight: 400, fontSize: 168, color: INK,
                  margin: 0, lineHeight: 1, letterSpacing: "-0.01em",
                }}
              >
                Ori.<span style={{ fontStyle: "italic" }}>ai</span>
              </h1>

              <p
                style={{
                  fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, marginTop: 16,
                  lineHeight: 1.6,
                }}
              >
                <span style={{ display: "block", whiteSpace: "nowrap" }}>
                  Learns how you function, then functions for you.
                </span>
              </p>

              {/* printed-caption rule line */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22, paddingLeft: 4 }}>
                <div style={{ width: 210, height: 1, background: "rgba(27,27,24,0.22)" }} />
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: INK_SOFT }}>
                  FIG. 01 — ORI, WORKING THROUGH YOUR DAY
                </span>
              </div>
            </div>
          </div>

          {/* the demo — a sheet of blue origami paper resting on the desk;
              its own shadow fades during the fold so the crane floats free */}
          <div style={{ flex: "0 0 auto", transform: "scale(1.08)", transformOrigin: "center" }}>
            <WorkflowBuildDemo />
          </div>
        </div>
      </div>
    </div>
  );
}
