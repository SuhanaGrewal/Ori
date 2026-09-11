import React, { useState } from "react";
import craneLogo from "./assets/crane-logo.svg";
import WhySection from "./WhySection";

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
        padding: "26px 48px", flexShrink: 0,
      }}
    >
      <img src={craneLogo} alt="Ori" style={{ width: 52, height: 52 }} />

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
        Watch Demo
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div style={{ background: BG, fontFamily: BODY }}>
      <style>{FONT_IMPORT}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <NavBar />

        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "0 48px",
          }}
        >
          <h1
            style={{
              fontFamily: SERIF, fontWeight: 500, fontSize: 176, color: INK,
              margin: 0, lineHeight: 1, letterSpacing: "-0.01em",
            }}
          >
            Ori.<span style={{ fontStyle: "italic" }}>ai</span>
          </h1>

          <p
  style={{
    fontFamily: BODY, fontSize: 17, color: INK_SOFT, marginTop: 16,
    lineHeight: 1.6,
  }}
>
  <span style={{ display: "block", whiteSpace: "nowrap" }}>
    Ori turns your team's everyday work into automations that build and
  </span>
  <span style={{ display: "block", whiteSpace: "nowrap" }}>
    maintain themselves, without anyone writing a workflow.
  </span>
</p>
        </div>
      </div>

      <WhySection />
    </div>
  );
}