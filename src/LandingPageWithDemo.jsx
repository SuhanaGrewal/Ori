import React, { useState } from "react";
import craneLogo from "./assets/crane-logo-slate.svg";
import WorkflowBuildDemo from "./WorkflowBuildDemo";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const SERIF = "'Playfair Display', serif";
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap');`;

const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const ACCENT = "#5C8A94";
const ACCENT_SOFT = "#D9E7EA";
const BG = "#FFFFFF";

function NavLink({ children }) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: BODY, fontSize: 15, cursor: "pointer",
        color: hover ? INK : INK_SOFT,
        transition: "color 0.15s ease",
      }}
    >
      {children}
    </span>
  );
}

function NavBar() {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 48px",
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(27,27,24,0.07)",
        boxShadow: "0 12px 32px -24px rgba(27,27,24,0.35)",
      }}
    >
      <img src={craneLogo} alt="Ori" style={{ width: 50, height: 50 }} />

      <div style={{ display: "flex", gap: 44 }}>
        <NavLink>Why?</NavLink>
        <NavLink>What?</NavLink>
        <NavLink>How?</NavLink>
      </div>

      <div
        style={{
          fontFamily: BODY, fontSize: 14, fontWeight: 500, color: ACCENT,
          background: ACCENT_SOFT, padding: "10px 20px", borderRadius: 999,
          cursor: "pointer",
        }}
      >
        Get in Touch
      </div>
    </div>
  );
}

export default function LandingPageWithDemo() {
  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: BODY, paddingTop: 66 }}>
      <style>{FONT_IMPORT}</style>
      <NavBar />

      <div
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 48px",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 90, maxWidth: 1200, width: "100%", flexWrap: "wrap",
            transform: "translateX(-40px)",
          }}
        >
          <div style={{ flex: "0 0 auto", transform: "translateX(-28px)" }}>
            <h1
              style={{
                fontFamily: SERIF, fontWeight: 500, fontSize: 168, color: INK,
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
                Ori turns your team's everyday work into automations that
              </span>
              <span style={{ display: "block", whiteSpace: "nowrap" }}>
                build and maintain themselves, without anyone writing a workflow.
              </span>
            </p>
          </div>

          <div
            style={{
              flex: "0 0 auto", borderRadius: 2,
              background: "#FFFFFF",
              border: "1px solid rgba(27,27,24,0.08)",
              padding: 28,
              boxShadow: "0 3px 6px -2px rgba(27,27,24,0.10), 0 32px 64px -28px rgba(27,27,24,0.22)",
              transform: "scale(1.1)", transformOrigin: "center",
            }}
          >
            <WorkflowBuildDemo />
          </div>
        </div>
      </div>
    </div>
  );
}
