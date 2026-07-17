import React, { useEffect, useRef, useState } from "react";
import { motion, cubicBezier, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";

import slackIcon from "./assets/slack-icon.svg";
import gmailIcon from "./assets/gmail-icon.svg";
import sheetsIcon from "./assets/sheets-icon.svg";
import craneAccent from "./assets/crane-accent.png";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const FONT_IMPORT = `@import url('https://fonts.cdnfonts.com/css/cmu-serif'); @import url('https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;1,400&display=swap');`;

const ACCENT = "#5C8A94";
const ACCENT_SOFT = "#D9E7EA";
const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";

// shared paper material — warm off-white, fine matte grain
const PAPER = "#FBF9F4";
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.16'/%3E%3C/svg%3E\")";
const SHEET_EDGE = "1px solid rgba(27,27,24,0.08)";
const SHEET_SHADOW = "0 3px 6px -2px rgba(27,27,24,0.10), 0 32px 64px -28px rgba(27,27,24,0.22)";
const CARD_SHADOW_REST = "0 2px 3px -1px rgba(27,27,24,0.16), 0 10px 18px -12px rgba(27,27,24,0.22)";
const CARD_SHADOW_HOVER = "0 6px 10px -3px rgba(27,27,24,0.12), 0 22px 34px -16px rgba(27,27,24,0.26)";

const SIZE = 560;
const HALF = SIZE / 2;
const ZOOM = 3.2;

// content is designed at full size, printed on the sheet small, and the
// camera's zoom brings it back to ~1.1x design size on screen
const CONTENT_SCALE = 0.34;

// one smooth, weighted move: eased keyframes + a soft spring
const EASE = cubicBezier(0.33, 0, 0.12, 1);
const SPRING = { stiffness: 58, damping: 26, mass: 1 };

/* ---------------------------------------------------------------------------
   The sheet: a square with a pressed vertical and horizontal crease — a
   cross dividing it into four corner quadrants. Embossed, not drawn — a
   soft cast shadow below-right, a hairline catchlight above-left, and a
   whisper of a core line, lit from the top-left.
--------------------------------------------------------------------------- */

const CREASES = [
  [HALF, 0, HALF, SIZE],
  [0, HALF, SIZE, HALF],
];

function CrossCreases() {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      <defs>
        <filter id="crSoft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
      {CREASES.map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <line x1={x1 + 1.6} y1={y1 + 2.4} x2={x2 + 1.6} y2={y2 + 2.4} stroke="rgba(27,27,24,0.07)" strokeWidth={4.5} filter="url(#crSoft)" />
          <line x1={x1 - 0.8} y1={y1 - 1.2} x2={x2 - 0.8} y2={y2 - 1.2} stroke="rgba(255,255,255,0.8)" strokeWidth={1.2} />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(27,27,24,0.06)" strokeWidth={1} />
        </g>
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   The corner tour: dive into the top-left quadrant, then pan corner to
   corner — top-right, bottom-right, bottom-left — pausing at each.
--------------------------------------------------------------------------- */

// quadrant focal centres (local px)
const CORNERS = [
  { x: 140, y: 140 }, // 01 top-left     — Observes
  { x: 420, y: 140 }, // 02 top-right
  { x: 420, y: 420 }, // 03 bottom-right
  { x: 140, y: 420 }, // 04 bottom-left
];

const tzx = (c) => ZOOM * (HALF - c.x);
const tzy = (c) => ZOOM * (HALF - c.y);

// dive into TL, pan corner to corner (TR · BR · BL), then pull all the way
// back out to the whole sheet for the Maintains finale
const CAM_KEYS = [0.02, 0.1, 0.2, 0.27, 0.37, 0.44, 0.54, 0.61, 0.71, 0.8];
const CAM_TX = [0, tzx(CORNERS[0]), tzx(CORNERS[0]), tzx(CORNERS[1]), tzx(CORNERS[1]), tzx(CORNERS[2]), tzx(CORNERS[2]), tzx(CORNERS[3]), tzx(CORNERS[3]), 0];
const CAM_TY = [0, tzy(CORNERS[0]), tzy(CORNERS[0]), tzy(CORNERS[1]), tzy(CORNERS[1]), tzy(CORNERS[2]), tzy(CORNERS[2]), tzy(CORNERS[3]), tzy(CORNERS[3]), 0];
const CAM_SCALE = [1, ZOOM, ZOOM, ZOOM, ZOOM, ZOOM, ZOOM, ZOOM, ZOOM, 1];

// each corner stage fades in as its corner settles, out as the camera leaves —
// Builds fades out fully before the camera pulls back for Maintains
const STAGE_FADES = [
  [0.09, 0.14, 0.2, 0.25],
  [0.27, 0.32, 0.37, 0.42],
  [0.44, 0.49, 0.54, 0.59],
  [0.61, 0.66, 0.7, 0.74],
];
// Maintains lives in the centre of the whole sheet — it only appears once the
// zoom-out has fully settled (the spring needs room past the 0.8 keyframe),
// so the sheet is back to full size and empty first
const MAINTAINS_FADE = [0.9, 0.97];

// where each stage's block sits on the sheet (local px, top-left of block)
const STAGE_POS = [
  { left: 45, top: 60 },
  { left: HALF + 45, top: 60 },
  { left: HALF + 45, top: HALF + 60 },
  { left: 45, top: HALF + 60 },
];

/* ------------------------------ Observes --------------------------------- */

// a cycling "live ingest" line — what Ori is reading right now
const INGEST = [
  "reading   #ops   ·   handoff thread",
  "parsing   invoice 4471   ·   14 fields",
  "scanning   weekly report   ·   sheet 2",
  "watching   #sales   ·   deal closed",
  "indexing   contract   ·   redline v3",
];

function IngestLine() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setI((p) => (p + 1) % INGEST.length), 1700);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 20, marginTop: 4 }}>
      <motion.span
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
        style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, flexShrink: 0 }}
      />
      <div style={{ position: "relative", height: 20, flex: 1, overflow: "hidden" }}>
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            fontFamily: MONO,
            fontSize: 12.5,
            letterSpacing: "0.02em",
            color: INK_SOFT,
          }}
        >
          {INGEST[i]}
        </motion.span>
      </div>
    </div>
  );
}

function ObservesDiagram() {
  const rows = [
    { src: slackIcon, alt: "Slack" },
    { src: gmailIcon, alt: "Gmail" },
    { src: sheetsIcon, alt: "Google Sheets" },
  ];
  const W = 520;
  const H = 200;
  const logoX = 4;
  const logoSize = 50;
  const rowY = [32, 100, 168];
  const swanX = 452;
  const swanY = 100;
  // gentle curves from each logo into the swan
  const paths = rowY.map(
    (y) => `M ${logoX + logoSize + 10} ${y} C ${W * 0.48} ${y}, ${W * 0.5} ${swanY}, ${swanX - 22} ${swanY}`
  );

  return (
    <div style={{ position: "relative", width: W, height: H }}>
      {/* wires + flowing dots */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <filter id="dotGlow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {paths.map((d, i) => (
          <g key={i}>
            <path id={`obs-wire-${i}`} d={d} fill="none" stroke="rgba(92,138,148,0.22)" strokeWidth={1} />
            {[0, 0.9, 1.8].map((delay, j) => (
              <g key={j}>
                <animateMotion dur="2.7s" begin={`${delay}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#obs-wire-${i}`} />
                </animateMotion>
                <circle r={7} fill={ACCENT} opacity={0.35} filter="url(#dotGlow)" />
                <circle r={2.6} fill={ACCENT} />
              </g>
            ))}
          </g>
        ))}
      </svg>

      {/* the tools — transparent logos, no tiles */}
      {rows.map((r, i) => (
        <img
          key={r.alt}
          src={r.src}
          alt={r.alt}
          style={{
            position: "absolute",
            left: logoX,
            top: rowY[i] - logoSize / 2,
            width: logoSize,
            height: logoSize,
            objectFit: "contain",
            filter: "drop-shadow(0 2px 5px rgba(27,27,24,0.14))",
          }}
        />
      ))}

      {/* the crane, glowing as information arrives */}
      <motion.div
        animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.12, 1] }}
        transition={{ duration: 2.7, ease: "easeInOut", repeat: Infinity }}
        style={{
          position: "absolute",
          left: swanX - 52,
          top: swanY - 52,
          width: 104,
          height: 104,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${ACCENT_SOFT} 0%, rgba(217,231,234,0) 68%)`,
        }}
      />
      <motion.img
        src={craneAccent}
        alt=""
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2.7, ease: "easeInOut", repeat: Infinity }}
        style={{
          position: "absolute",
          left: swanX - 30,
          top: swanY - 30,
          width: 60,
          height: 60,
          filter: `drop-shadow(0 0 10px ${ACCENT_SOFT})`,
        }}
      />
    </div>
  );
}

function ObservesContent() {
  return (
    <div style={{ width: 560 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", color: INK_SOFT, margin: "0 0 14px" }}>
        01 / 05
      </p>

      <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 64, color: INK, margin: "0 0 26px", lineHeight: 1 }}>
        Observes
      </h3>

      <ObservesDiagram />

      <IngestLine />

      <p style={{ fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 520 }}>
        Ori connects directly to the tools your team runs on — Slack, Gmail, Docs — and reads exactly
        what's happening, in realtime.
      </p>
    </div>
  );
}

/* ------------------------------- Audits ---------------------------------- */

// the raw activity stream Ori keeps rolling through — three different
// people keep exporting the same report
const AUDIT_LOG = [
  { t: "09:01", who: "Priya", act: "export → report_wk27.xlsx", match: true },
  { t: "09:04", who: "Theo", act: "paste → crm.leads", match: false },
  { t: "09:09", who: "Sam", act: "export → report_wk27.xlsx", match: true },
  { t: "09:12", who: "Priya", act: "rename → Q3_final_v2", match: false },
  { t: "09:15", who: "Anaïs", act: "approve → PO-1121", match: false },
  { t: "09:21", who: "Jordan", act: "export → report_wk27.xlsx", match: true },
  { t: "09:26", who: "Sam", act: "comment → #ops thread", match: false },
  { t: "09:30", who: "Theo", act: "update → tracker row 44", match: false },
  { t: "09:33", who: "Anaïs", act: "email → weekly summary", match: false },
  { t: "09:38", who: "Jordan", act: "sync → sheet ⇄ crm", match: false },
];

const LOG_LINE_H = 21;

function AuditLogStream() {
  const fade = "linear-gradient(transparent, black 14%, black 86%, transparent)";
  return (
    <div style={{ width: 312, height: 196, overflow: "hidden", WebkitMaskImage: fade, maskImage: fade }}>
      <motion.div
        animate={{ y: [0, -AUDIT_LOG.length * LOG_LINE_H] }}
        transition={{ duration: 11, ease: "linear", repeat: Infinity }}
      >
        {[...AUDIT_LOG, ...AUDIT_LOG].map((l, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: LOG_LINE_H,
              fontFamily: MONO,
              fontSize: 11.5,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: INK_SOFT, opacity: 0.55 }}>{l.t}</span>
            <span style={{ color: l.match ? ACCENT : INK_SOFT, fontWeight: l.match ? 700 : 400, minWidth: 52, display: "inline-block" }}>{l.who}</span>
            <span style={{ color: l.match ? ACCENT : INK_SOFT, opacity: l.match ? 1 : 0.75 }}>{l.act}</span>
            {l.match && (
              <span
                style={{
                  marginLeft: 2,
                  padding: "1px 5px",
                  border: `1px solid ${ACCENT}`,
                  color: ACCENT,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                }}
              >
                MATCH
              </span>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// a liquid-glass panel — a translucent gradient pane with a blurred backdrop,
// a bright specular top edge, a soft inner glow and a floated cast shadow
const PANEL = {
  background: "linear-gradient(155deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.34) 55%, rgba(255,255,255,0.5) 100%)",
  backdropFilter: "blur(20px) saturate(1.7)",
  WebkitBackdropFilter: "blur(20px) saturate(1.7)",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: 16,
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -10px 22px rgba(255,255,255,0.14), inset 0 0 0 0.5px rgba(255,255,255,0.3), 0 2px 6px rgba(27,27,24,0.06), 0 24px 50px -26px rgba(27,27,24,0.40)",
  padding: "16px 18px",
};

function PanelHeader({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <motion.span
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.3, ease: "easeInOut", repeat: Infinity }}
        style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, flexShrink: 0 }}
      />
      <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: ACCENT }}>
        {label}
      </span>
    </div>
  );
}

// the findings ledger — matches tick in one by one, then the pattern is stamped
const FINDINGS = [
  { text: "Report export · Priya", teal: false },
  { text: "Report export · Sam", teal: false },
  { text: "Report export · Jordan", teal: false },
  { text: "Same task · 3 people · weekly", teal: true },
];

function AuditFindings() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStep((s) => (s + 1) % (FINDINGS.length + 2)), 1400);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ ...PANEL, width: 214 }}>
      <PanelHeader label="Auditing" />

      {FINDINGS.map((f, i) => {
        const visible = step > i;
        const isSummary = i === FINDINGS.length - 1;
        return (
          <motion.div
            key={f.text}
            initial={false}
            animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -6 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontFamily: BODY,
              fontSize: 13,
              fontWeight: f.teal ? 600 : 400,
              lineHeight: "22px",
              color: f.teal ? ACCENT : INK,
              borderTop: isSummary ? "1px solid rgba(27,27,24,0.10)" : "none",
              marginTop: isSummary ? 8 : 0,
              paddingTop: isSummary ? 8 : 0,
            }}
          >
            <span style={{ fontSize: 11, color: ACCENT, flexShrink: 0 }}>{f.teal ? "◆" : "✓"}</span>
            {f.text}
          </motion.div>
        );
      })}
    </div>
  );
}

function AuditsVisual() {
  return (
    <div style={{ display: "flex", gap: 28, width: 560, height: 210, alignItems: "flex-start" }}>
      <AuditLogStream />
      <AuditFindings />
    </div>
  );
}

function AuditsContent() {
  return (
    <div style={{ width: 560 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", color: INK_SOFT, margin: "0 0 14px" }}>
        02 / 05
      </p>

      <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 64, color: INK, margin: "0 0 26px", lineHeight: 1 }}>
        Audits
      </h3>

      <AuditsVisual />

      <p style={{ fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 560 }}>
        Ori lines that activity up day after day, watching for patterns or repetitions in tasks — even
        across different people.
      </p>
    </div>
  );
}

/* ------------------------------- Detects --------------------------------- */

// a value that counts up, holds, then resets and climbs again — always alive
// whenever the corner is on screen, no scroll trigger needed
function useLoopCount(target, upMs = 1500, holdMs = 3200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    let phase = "up";
    let phaseStart = null;
    const tick = (t) => {
      if (phaseStart === null) phaseStart = t;
      const el = t - phaseStart;
      if (phase === "up") {
        const p = Math.min(el / upMs, 1);
        setV(target * (1 - Math.pow(1 - p, 3)));
        if (p >= 1) {
          phase = "hold";
          phaseStart = t;
        }
      } else if (el >= holdMs) {
        phase = "up";
        phaseStart = t;
        setV(0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, upMs, holdMs]);
  return v;
}

// the consistency checks Ori runs before it trusts a pattern — ticking in
// one by one, ending in the verdict that clears it for automation
const VERIFY_STEPS = [
  { text: "Recurred · 3 weeks running", teal: false },
  { text: "Same steps every time", teal: false },
  { text: "Low variance · no edge cases", teal: false },
  { text: "Consistent → safe to automate", teal: true },
];

function DetectsVisual() {
  const hrs = useLoopCount(6.2);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStep((s) => (s + 1) % (VERIFY_STEPS.length + 2)), 1300);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ display: "flex", gap: 40, width: 560, height: 210, alignItems: "center" }}>
      {/* the priced figure — what the verified pattern is costing */}
      <div style={{ width: 236 }}>
        <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 78, color: INK, margin: 0, lineHeight: 1 }}>
          {hrs.toFixed(1)}
          <span style={{ fontSize: 34 }}> hrs</span>
        </p>
        <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, margin: "8px 0 16px" }}>
          lost to this repeat, every week
        </p>
        {/* magnitude bar */}
        <div style={{ height: 4, borderRadius: 2, background: "rgba(27,27,24,0.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(hrs / 6.2) * 100}%`, background: ACCENT, borderRadius: 2 }} />
        </div>
      </div>

      {/* the verification card — checks run, then the verdict clears it */}
      <div style={{ ...PANEL, width: 236 }}>
        <PanelHeader label="Verifying pattern" />
        {VERIFY_STEPS.map((f, i) => {
          const visible = step > i;
          const isVerdict = i === VERIFY_STEPS.length - 1;
          return (
            <motion.div
              key={f.text}
              initial={false}
              animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -6 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                fontFamily: BODY,
                fontSize: 13,
                fontWeight: f.teal ? 600 : 400,
                lineHeight: "22px",
                color: f.teal ? ACCENT : INK,
                borderTop: isVerdict ? "1px solid rgba(27,27,24,0.10)" : "none",
                marginTop: isVerdict ? 8 : 0,
                paddingTop: isVerdict ? 8 : 0,
              }}
            >
              <span style={{ fontSize: 11, color: ACCENT, flexShrink: 0 }}>{f.teal ? "◆" : "✓"}</span>
              {f.text}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function DetectsContent() {
  return (
    <div style={{ width: 560 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", color: INK_SOFT, margin: "0 0 14px" }}>
        03 / 05
      </p>

      <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 64, color: INK, margin: "0 0 26px", lineHeight: 1 }}>
        Detects
      </h3>

      <DetectsVisual />

      <p style={{ fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 560 }}>
        Ori verifies which patterns are consistent enough to automate — then prices what they're
        costing in hours and errors.
      </p>
    </div>
  );
}

/* -------------------------------- Builds --------------------------------- */

const BUILD_STAGES = [
  { label: "New export", sub: "TRIGGER" },
  { label: "Verify + map", sub: "GUARDRAIL" },
  { label: "Write to sheet", sub: "ACTION" },
];

function BuildChip({ label, sub, visible }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 10 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{ ...PANEL, width: 116, padding: "11px 13px", flexShrink: 0 }}
    >
      <p style={{ fontFamily: BODY, fontSize: 13, fontWeight: 500, color: INK, margin: 0, whiteSpace: "nowrap" }}>
        {label}
      </p>
      <p style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.14em", color: INK_SOFT, margin: "4px 0 0" }}>
        {sub}
      </p>
    </motion.div>
  );
}

function BuildConn({ drawn }) {
  return (
    <div style={{ width: 30, height: 2, flexShrink: 0, position: "relative", margin: "0 -1px" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(27,27,24,0.12)" }} />
      <motion.div
        initial={false}
        animate={{ scaleX: drawn ? 1 : 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        style={{ position: "absolute", inset: 0, background: ACCENT, transformOrigin: "left center" }}
      />
    </div>
  );
}

// the automation Ori writes, line by line — the code the user never sees
const CODE_LINES = [
  { t: "on  export(report_wk27):", indent: 0 },
  { t: "verify · sender ok", indent: 1 },
  { t: "map · A,B,F → sheet cols", indent: 1 },
  { t: "append → sheet.sync ✓", indent: 1 },
];

function BuildsVisual() {
  // one assembling loop: code writes itself, the pipeline builds, then it
  // ships Live — holds, and rebuilds
  const [step, setStep] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStep((s) => (s + 1) % 11), 560);
    return () => clearInterval(iv);
  }, []);
  const live = step >= 8;

  return (
    <div style={{ width: 560, height: 268, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Ori writing the automation */}
      <div style={{ ...PANEL, width: 356, padding: "13px 16px" }}>
        <PanelHeader label={live ? "Shipped" : "Writing automation"} />
        <div style={{ minHeight: 92 }}>
          {CODE_LINES.map((l, i) => {
            const shown = step >= i + 1;
            const isCursor = step === i + 1;
            return (
              <motion.div
                key={l.t}
                initial={false}
                animate={{ opacity: shown ? 1 : 0 }}
                transition={{ duration: 0.25 }}
                style={{
                  fontFamily: MONO,
                  fontSize: 11.5,
                  lineHeight: "22px",
                  color: i === CODE_LINES.length - 1 ? ACCENT : INK,
                  paddingLeft: l.indent * 18,
                  whiteSpace: "nowrap",
                }}
              >
                {l.t}
                {isCursor && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.7, repeat: Infinity }}
                    style={{ display: "inline-block", width: 6, height: 13, marginLeft: 3, background: INK_SOFT, verticalAlign: "-2px" }}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* the pipeline it deploys */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <BuildChip {...BUILD_STAGES[0]} visible={step >= 2} />
        <BuildConn drawn={step >= 4} />
        <BuildChip {...BUILD_STAGES[1]} visible={step >= 5} />
        <BuildConn drawn={step >= 6} />
        <BuildChip {...BUILD_STAGES[2]} visible={step >= 7} />
        <BuildConn drawn={step >= 8} />
        <motion.div
          initial={false}
          animate={{ opacity: live ? 1 : 0, scale: live ? 1 : 0.9 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            flexShrink: 0,
            padding: "7px 13px",
            borderRadius: 999,
            background: ACCENT_SOFT,
          }}
        >
          <motion.span
            animate={live ? { opacity: [0.4, 1, 0.4] } : {}}
            transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity }}
            style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }}
          />
          <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: ACCENT }}>Live</span>
        </motion.div>
      </div>
    </div>
  );
}

function BuildsContent() {
  return (
    <div style={{ width: 560 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", color: INK_SOFT, margin: "0 0 14px" }}>
        04 / 05
      </p>

      <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 64, color: INK, margin: "0 0 26px", lineHeight: 1 }}>
        Builds
      </h3>

      <BuildsVisual />

      <p style={{ fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 560 }}>
        You approve, and Ori builds it — writing the automation and shipping it live. No canvas, no
        nodes, no code to touch.
      </p>
    </div>
  );
}

/* ------------------------------ Maintains -------------------------------- */

// each automation carries a live update that Ori folds in — a change lands,
// then it integrates, then it's live again
const MAINTAINED = [
  { flow: "Approval → Slack", update: "Legal review added" },
  { flow: "Deal → CRM", update: "New stage: Won" },
  { flow: "Invoice → Sheet", update: "Tax column added" },
];

function MaintainsVisual() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1300);
    return () => clearInterval(iv);
  }, []);
  const active = Math.floor(tick / 3) % MAINTAINED.length;
  const phase = tick % 3; // 0 update lands · 1 integrating · 2 live

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.3, ease: "easeInOut", repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }}
        />
        <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", color: ACCENT }}>
          SELF-MAINTAINING
        </span>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {MAINTAINED.map((m, i) => {
          const isActive = active === i;
          let status = "live";
          let statusColor = INK_SOFT;
          if (isActive && phase === 0) {
            status = `+ ${m.update}`;
            statusColor = INK;
          } else if (isActive && phase === 1) {
            status = "integrating…";
            statusColor = ACCENT;
          } else if (isActive && phase === 2) {
            status = "updated ✓";
            statusColor = ACCENT;
          }
          return (
            <motion.div
              key={m.flow}
              animate={{ scale: isActive && phase === 0 ? [1, 1.05, 1] : 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ ...PANEL, width: 148, padding: "9px 13px", display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <motion.span
                  animate={isActive && phase === 1 ? { opacity: [1, 0.3, 1] } : { opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: isActive && phase === 1 ? 0.6 : 1.4, ease: "easeInOut", repeat: Infinity, delay: i * 0.3 }}
                  style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, flexShrink: 0 }}
                />
                <span style={{ fontFamily: BODY, fontSize: 12, color: INK, whiteSpace: "nowrap" }}>{m.flow}</span>
              </div>
              <span style={{ fontFamily: BODY, fontSize: 10.5, color: statusColor, whiteSpace: "nowrap" }}>{status}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function MaintainsContent() {
  return (
    <div style={{ width: 500, textAlign: "center" }}>
      <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", color: INK_SOFT, margin: "0 0 12px" }}>
        05 / 05
      </p>
      <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 46, color: INK, margin: "0 0 26px", lineHeight: 1 }}>
        Maintains
      </h3>

      <MaintainsVisual />

      <p style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, lineHeight: 1.6, margin: "26px auto 0", maxWidth: 410 }}>
        Ori watches every run, repairing automations when your tools change and retiring the ones that
        turn obsolete.
      </p>
    </div>
  );
}

/* --------------------------- sticky crease-zoom -------------------------- */

// a stage block printed on one quadrant of the sheet — fades in as its
// corner settles under the camera
function StagePrint({ scrollYProgress, index, children }) {
  const opacity = useTransform(scrollYProgress, STAGE_FADES[index], [0, 1, 1, 0]);
  return (
    <motion.div
      style={{
        opacity,
        position: "absolute",
        left: STAGE_POS[index].left,
        top: STAGE_POS[index].top,
        width: 560,
        scale: CONTENT_SCALE,
        transformOrigin: "top left",
      }}
    >
      {children}
    </motion.div>
  );
}

function CreaseZoom() {
  const zoomRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: zoomRef,
    offset: ["start start", "end end"],
  });

  // dive into the top-left corner, pan corner to corner, then pull all the
  // way back out for Maintains — the sheet never disappears; every stage is
  // printed on its paper
  const tx = useSpring(useTransform(scrollYProgress, CAM_KEYS, CAM_TX, { ease: EASE }), SPRING);
  const ty = useSpring(useTransform(scrollYProgress, CAM_KEYS, CAM_TY, { ease: EASE }), SPRING);
  const scale = useSpring(useTransform(scrollYProgress, CAM_KEYS, CAM_SCALE, { ease: EASE }), SPRING);
  const maintainsOpacity = useTransform(scrollYProgress, MAINTAINS_FADE, [0, 1]);

  return (
    <div ref={zoomRef} style={{ position: "relative", height: "560vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "relative", width: SIZE, height: SIZE }}>
          <motion.div
            style={{
              x: tx,
              y: ty,
              scale,
              transformOrigin: "50% 50%",
              position: "absolute",
              inset: 0,
              background: PAPER,
              backgroundImage: GRAIN,
              border: SHEET_EDGE,
              boxShadow: SHEET_SHADOW,
            }}
          >
            <CrossCreases />

            <StagePrint scrollYProgress={scrollYProgress} index={0}>
              <ObservesContent />
            </StagePrint>
            <StagePrint scrollYProgress={scrollYProgress} index={1}>
              <AuditsContent />
            </StagePrint>
            <StagePrint scrollYProgress={scrollYProgress} index={2}>
              <DetectsContent />
            </StagePrint>
            <StagePrint scrollYProgress={scrollYProgress} index={3}>
              <BuildsContent />
            </StagePrint>

            {/* the finale — centred on the whole sheet once it pulls back out */}
            <motion.div
              style={{
                opacity: maintainsOpacity,
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaintainsContent />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------- part 2: the ruler of work ------------------------ */

const OFFER_TASKS = [
  {
    n: "01",
    title: "Repetitive Work",
    desc: "The same keystrokes on repeat — copy-pasting, re-keying and reformatting the same data, week after week.",
  },
  {
    n: "02",
    title: "Routine Tasks",
    desc: "Scheduled busywork that runs like clockwork — the Friday report, the tracker update, the standing sync.",
  },
  {
    n: "03",
    title: "Handoffs",
    desc: "Work passed between people and tools, where the context leaks out and things slip through the cracks.",
  },
];

const RUNIT = 108; // px per cm on the ruler
const R_VIS = RUNIT * 10; // ten centimetres visible at a time
const R_MAX = 30; // marks 0 → 30

function RulerMarks() {
  const nums = [];
  const ticks = [];
  for (let u = 0; u <= R_MAX; u++) {
    const x = u * RUNIT;
    // whole-cm mark
    ticks.push(<line key={`M${u}`} x1={x} y1={0} x2={x} y2={40} stroke="rgba(27,27,24,0.34)" strokeWidth={1.3} />);
    if (u < R_MAX) {
      // millimetre graduations — the half-cm is a touch taller
      for (let m = 1; m < 10; m++) {
        const mx = x + (m / 10) * RUNIT;
        const h = m === 5 ? 22 : 12;
        ticks.push(
          <line key={`m${u}-${m}`} x1={mx} y1={0} x2={mx} y2={h} stroke="rgba(27,27,24,0.18)" strokeWidth={0.8} />
        );
      }
    }
    nums.push(
      <text key={`n${u}`} x={x} y={62} textAnchor="middle" fontFamily={MONO} fontSize={13} letterSpacing={0.5} fill="rgba(27,27,24,0.4)">
        {u}
      </text>
    );
  }
  // a single "cm" unit label under the 0 mark
  nums.push(
    <text key="cm" x={4} y={80} textAnchor="start" fontFamily={MONO} fontSize={9} letterSpacing={1} fill="rgba(27,27,24,0.3)">
      CM
    </text>
  );
  return (
    <>
      {ticks}
      {nums}
    </>
  );
}

function OffersRuler() {
  const ref = useRef(null);
  const soft = { stiffness: 60, damping: 26, mass: 1 };

  // progress read straight off the section's live position every scroll —
  // no cached offsets, so it can't go stale when the layout above changes
  const scrollYProgress = useMotionValue(0);
  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const range = el.offsetHeight - window.innerHeight;
      if (range <= 0) return;
      scrollYProgress.set(Math.min(1, Math.max(0, -el.getBoundingClientRect().top / range)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [scrollYProgress]);

  // the ruler slides one 10-cm window at a time: 0–10 · 10–20 · 20–30
  const rulerX = useSpring(
    useTransform(scrollYProgress, [0, 0.18, 0.32, 0.5, 0.64], [0, 0, -10 * RUNIT, -10 * RUNIT, -20 * RUNIT], { ease: EASE }),
    soft
  );

  // each task crossfades as its window arrives
  const op0 = useTransform(scrollYProgress, [0.22, 0.28], [1, 0]);
  const op1 = useTransform(scrollYProgress, [0.28, 0.34, 0.54, 0.6], [0, 1, 1, 0]);
  const op2 = useTransform(scrollYProgress, [0.6, 0.66], [0, 1]);
  const ops = [op0, op1, op2];

  return (
    <div ref={ref} style={{ position: "relative", height: "320vh" }}>
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
        {/* section heading, top-left */}
        <div style={{ position: "absolute", top: 96, left: 64 }}>
          <p style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.24em", color: INK_SOFT, margin: "0 0 14px" }}>
            THE KIND OF WORK ORI AUTOMATES
          </p>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 76, color: INK, margin: 0, lineHeight: 1 }}>
            Ori&rsquo;s Offer
          </h2>
        </div>

        {/* the current task + the ruler, centred */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <div style={{ position: "relative", width: 640, height: 176 }}>
            {OFFER_TASKS.map((t, i) => (
              <motion.div
                key={t.n}
                style={{ opacity: ops[i], position: "absolute", inset: 0, textAlign: "center" }}
              >
                <p style={{ fontFamily: MONO, fontSize: 15, letterSpacing: "0.1em", color: INK_SOFT, margin: "0 0 14px" }}>
                  {t.n}
                </p>
                <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 56, color: INK, margin: "0 0 20px", lineHeight: 1 }}>
                  {t.title}
                </h3>
                <p style={{ fontFamily: BODY, fontSize: 17, color: INK_SOFT, lineHeight: 1.6, margin: "0 auto", maxWidth: 520 }}>
                  {t.desc}
                </p>
              </motion.div>
            ))}
          </div>

          {/* the ruler window */}
          <div style={{ width: R_VIS, maxWidth: "92vw", overflow: "hidden" }}>
            <motion.svg style={{ x: rulerX }} width={R_MAX * RUNIT + RUNIT} height={88}>
              <RulerMarks />
            </motion.svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- section ------------------------------- */

export default function WhatSection() {
  return (
    <section style={{ position: "relative", background: "transparent" }}>
      <style>{FONT_IMPORT}</style>

      <CreaseZoom />

      <OffersRuler />
    </section>
  );
}
