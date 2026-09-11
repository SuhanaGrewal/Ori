import React, { useEffect, useRef, useState } from "react";
import { motion, cubicBezier, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";

import slackIcon from "./assets/slack-icon.svg";
import gmailIcon from "./assets/gmail-icon.svg";
import sheetsIcon from "./assets/sheets-icon.svg";
import craneAccent from "./assets/crane-accent.png";
import formsIcon from "./assets/forms-icon.webp";
import notionIcon from "./assets/notion-icon.svg";
import excelIcon from "./assets/excel-icon.webp";
import outlookIcon from "./assets/outlook-icon.webp";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const FONT_IMPORT = `@import url('https://fonts.cdnfonts.com/css/cmu-serif'); @import url('https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;1,400&display=swap');`;

const ACCENT = "#5C8A94";
const ACCENT_SOFT = "#D9E7EA";
const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const RETIRE = "#A9776D";

// shared paper material — warm off-white, fine matte grain
const PAPER = "#FBF9F4";
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.16'/%3E%3C/svg%3E\")";
const SHEET_EDGE = "1px solid rgba(27,27,24,0.08)";
const SHEET_SHADOW = "0 3px 6px -2px rgba(27,27,24,0.10), 0 32px 64px -28px rgba(27,27,24,0.22)";

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
   corner — top-right, bottom-right, bottom-left — pausing at each, then
   pull all the way back out to reveal the whole assembled sheet.
--------------------------------------------------------------------------- */

// quadrant focal centres (local px)
const CORNERS = [
  { x: 140, y: 140 }, // 01 top-left     — Observes
  { x: 420, y: 140 }, // 02 top-right    — Audits
  { x: 420, y: 420 }, // 03 bottom-right — Builds
  { x: 140, y: 420 }, // 04 bottom-left  — Maintains
];

const tzx = (c) => ZOOM * (HALF - c.x);
const tzy = (c) => ZOOM * (HALF - c.y);

// dive into TL, pan corner to corner (TR · BR · BL), then pull all the way
// back out to the whole sheet as a quiet closing beat
const CAM_KEYS = [0.02, 0.1, 0.2, 0.27, 0.37, 0.44, 0.54, 0.61, 0.71, 0.8];
const CAM_TX = [0, tzx(CORNERS[0]), tzx(CORNERS[0]), tzx(CORNERS[1]), tzx(CORNERS[1]), tzx(CORNERS[2]), tzx(CORNERS[2]), tzx(CORNERS[3]), tzx(CORNERS[3]), 0];
const CAM_TY = [0, tzy(CORNERS[0]), tzy(CORNERS[0]), tzy(CORNERS[1]), tzy(CORNERS[1]), tzy(CORNERS[2]), tzy(CORNERS[2]), tzy(CORNERS[3]), tzy(CORNERS[3]), 0];
const CAM_SCALE = [1, ZOOM, ZOOM, ZOOM, ZOOM, ZOOM, ZOOM, ZOOM, ZOOM, 1];

// each corner stage fades in as its corner settles, out as the camera leaves —
// Maintains fades out fully before the camera pulls back for the finale
const STAGE_FADES = [
  [0.09, 0.14, 0.2, 0.25],
  [0.27, 0.32, 0.37, 0.42],
  [0.44, 0.49, 0.54, 0.59],
  [0.61, 0.66, 0.7, 0.74],
];

const SCENE_VH = 560;

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
        01 / 04
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

// the findings ledger — matches tick in one by one, the pattern is stamped,
// then the consistency checks run and the priced verdict lands. Audits now
// carries what used to be the separate Detects stage.
const FINDINGS = [
  { text: "Report export · Priya", teal: false },
  { text: "Report export · Sam", teal: false },
  { text: "Report export · Jordan", teal: false },
  { text: "Same task · 3 people · weekly", teal: false },
  { text: "Recurred · 3 weeks running", teal: false },
  { text: "Low variance · no edge cases", teal: false },
  { text: "6.2 hrs/wk lost → automate", teal: true },
];

function AuditFindings() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStep((s) => (s + 1) % (FINDINGS.length + 2)), 1200);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ ...PANEL, width: 236 }}>
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
    <div style={{ display: "flex", gap: 24, width: 560, alignItems: "center" }}>
      <AuditLogStream />
      <AuditFindings />
    </div>
  );
}

function AuditsContent() {
  return (
    <div style={{ width: 560 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", color: INK_SOFT, margin: "0 0 14px" }}>
        02 / 04
      </p>

      <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 64, color: INK, margin: "0 0 26px", lineHeight: 1 }}>
        Audits
      </h3>

      <AuditsVisual />

      <p style={{ fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 560 }}>
        Ori compares activity across people and time, flagging tasks that repeat the same way
        often enough to trust and automate.
      </p>
    </div>
  );
}

/* -------------------------------- Builds --------------------------------- */

// the drop shadow every floating logo shares — same treatment as the tool
// marks in the Observes diagram, so Builds reads as the same material
const LOGO_SHADOW = "drop-shadow(0 2px 5px rgba(27,27,24,0.16))";

// one stop on the pipeline — a bare floating logo, no tile, no fill
function TimelineIcon({ src, alt, size = 34, visible }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 6 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{ width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <img src={src} alt={alt} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: LOGO_SHADOW }} />
    </motion.div>
  );
}

// the line between two stops, with the step it performs written beneath it —
// inset from both icons so it reads as a connector, not a touching edge; the
// line draws in first, then the caption fades in further below it
function TimelineStep({ width, drawn, caption }) {
  const inset = 14;
  return (
    <div style={{ width, flexShrink: 0, paddingTop: 16 }}>
      <div style={{ position: "relative", height: 2 }}>
        <div style={{ position: "absolute", top: 0, left: inset, right: inset, height: 2, background: "rgba(27,27,24,0.12)" }} />
        <motion.div
          initial={false}
          animate={{ scaleX: drawn ? 1 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ position: "absolute", top: 0, left: inset, right: inset, height: 2, background: ACCENT, transformOrigin: "left center" }}
        />
      </div>
      <motion.p
        initial={false}
        animate={{ opacity: drawn ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: drawn ? 0.25 : 0 }}
        style={{
          fontFamily: MONO,
          fontSize: 11,
          lineHeight: 1.5,
          color: INK_SOFT,
          textAlign: "center",
          margin: "20px 6px 0",
        }}
      >
        {caption}
      </motion.p>
    </div>
  );
}

// three different automations Ori has built, cycled through — same
// mechanic, different tools, different work. `trigger` doubles as the first
// line of the code panel above the chain; the three captions become its body
const BUILD_CHAINS = [
  {
    trigger: "on formSubmit():",
    nodes: [
      { src: formsIcon, alt: "Google Forms" },
      { src: sheetsIcon, alt: "Google Sheets" },
      { src: notionIcon, alt: "Notion" },
      { src: slackIcon, alt: "Slack" },
    ],
    captions: ["onSubmit() → sheet.appendRow()", "rating ≥ 3 → filter, export table", "page.created() → post to #gtm"],
  },
  {
    trigger: "on emailReceived():",
    nodes: [
      { src: gmailIcon, alt: "Gmail" },
      { src: excelIcon, alt: "Excel" },
      { src: outlookIcon, alt: "Outlook" },
      { src: slackIcon, alt: "Slack" },
    ],
    captions: ["parse invoice → extract fields", "row.append() → finance_q3.xlsx", "mail.send() → approver queue"],
  },
  {
    trigger: "on rowUpdated():",
    nodes: [
      { src: sheetsIcon, alt: "Google Sheets" },
      { src: outlookIcon, alt: "Outlook" },
      { src: notionIcon, alt: "Notion" },
      { src: slackIcon, alt: "Slack" },
    ],
    captions: ["row.watch() → status change", "mail.send() → stakeholder digest", "sync → notion.rollup()"],
  },
];

const DOT_COLORS = ["#D9A199", "#DCC08F", "#A6C29B"];

// the automation Ori writes, line by line, above the chain it assembles —
// the same {trigger, captions} feed both, so the code and the pipeline it
// describes never fall out of sync
function BuildCode({ chain, step, live }) {
  const lines = [chain.trigger, ...chain.captions];
  return (
    <div style={{ ...PANEL, width: 380, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
        {DOT_COLORS.map((c) => (
          <span key={c} style={{ width: 6.5, height: 6.5, borderRadius: "50%", background: c, opacity: 0.6 }} />
        ))}
      </div>
      <PanelHeader label={live ? "Shipped" : "Writing automation"} />
      <div style={{ minHeight: 88 }}>
        {lines.map((l, i) => {
          const shown = i === 0 ? true : step >= [0, 2, 5, 8][i];
          const isCursor = i > 0 && step === [0, 2, 5, 8][i];
          return (
            <motion.div
              key={l}
              initial={false}
              animate={{ opacity: shown ? 1 : 0 }}
              transition={{ duration: 0.25 }}
              style={{
                fontFamily: MONO,
                fontSize: 11.5,
                lineHeight: "22px",
                color: i === lines.length - 1 ? ACCENT : INK,
                paddingLeft: i === 0 ? 0 : 18,
                whiteSpace: "nowrap",
              }}
            >
              {l}
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
  );
}

function BuildsVisual() {
  // one assembling loop per chain: the code writes itself, each stop lands,
  // then the line + caption to its right draw in — holds, then the next
  // automation takes its place
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 550);
    return () => clearInterval(iv);
  }, []);
  const step = tick % 12;
  const live = step >= 9;
  const chain = BUILD_CHAINS[Math.floor(tick / 12) % BUILD_CHAINS.length];

  return (
    <div style={{ width: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
      <BuildCode chain={chain} step={step} live={live} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        <TimelineIcon src={chain.nodes[0].src} alt={chain.nodes[0].alt} visible={step >= 0} />
        <TimelineStep width={104} drawn={step >= 2} caption={chain.captions[0]} />
        <TimelineIcon src={chain.nodes[1].src} alt={chain.nodes[1].alt} visible={step >= 3} />
        <TimelineStep width={104} drawn={step >= 5} caption={chain.captions[1]} />
        <TimelineIcon src={chain.nodes[2].src} alt={chain.nodes[2].alt} visible={step >= 6} />
        <TimelineStep width={104} drawn={step >= 8} caption={chain.captions[2]} />
        <TimelineIcon src={chain.nodes[3].src} alt={chain.nodes[3].alt} visible={step >= 9} />
      </div>
    </div>
  );
}

function BuildsContent() {
  return (
    <div style={{ width: 560 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", color: INK_SOFT, margin: "0 0 14px" }}>
        03 / 04
      </p>

      <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 64, color: INK, margin: "0 0 26px", lineHeight: 1 }}>
        Builds
      </h3>

      <BuildsVisual />

      <p style={{ fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 560 }}>
        You approve, Ori builds — writing the automation, connecting the tools, and shipping it
        live. You never touch a line of code.
      </p>
    </div>
  );
}

/* ------------------------------ Maintains -------------------------------- */

// each loop edits one rule and retires one stale one — cycles to a new
// example (different tool, different rule) each time it completes
const MAINTAIN_EXAMPLES = [
  { oldRule: "trigger: Slack #sales-updates", newRule: "trigger: Slack #revenue-updates", deprecated: "CRM field: deal_owner_legacy" },
  { oldRule: "trigger: Sheet range A1:F20", newRule: "trigger: Sheet range A1:H20", deprecated: "Gmail label: old-invoices" },
  { oldRule: "trigger: CRM stage = 'Won'", newRule: "trigger: CRM stage = 'Closed Won'", deprecated: "Slack channel: #legacy-ops" },
];

// named phases, each with its own hold time — the same {key, duration}
// timer pattern WorkflowBuildDemo uses for its stage loop
const MAINTAIN_PHASES = [
  { key: "rest", duration: 1000 },
  { key: "typing", duration: 700 },
  { key: "verified", duration: 1000 },
  { key: "retiring", duration: 700 },
  { key: "retired", duration: 1000 },
  { key: "summary", duration: 1400 },
];

function MaintainsVisual() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setPhaseIndex((p) => {
        const next = (p + 1) % MAINTAIN_PHASES.length;
        if (next === 0) setExampleIndex((e) => (e + 1) % MAINTAIN_EXAMPLES.length);
        return next;
      });
    }, MAINTAIN_PHASES[phaseIndex].duration);
    return () => clearTimeout(t);
  }, [phaseIndex]);

  const phase = MAINTAIN_PHASES[phaseIndex].key;
  const ex = MAINTAIN_EXAMPLES[exampleIndex];

  const order = ["rest", "typing", "verified", "retiring", "retired", "summary"];
  const at = (p) => order.indexOf(phase) >= order.indexOf(p);

  return (
    <div style={{ ...PANEL, width: 340 }}>
      <PanelHeader label="Self-maintaining" />

      {/* the rule edit — old line struck through, new line typed in below it,
          same diff shorthand a reviewer would recognise */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: MONO, fontSize: 12.5, lineHeight: "20px" }}>
        <span style={{ color: INK_SOFT, opacity: 0.6, flexShrink: 0 }}>−</span>
        <span style={{ color: INK_SOFT, opacity: 0.6, textDecoration: "line-through", whiteSpace: "nowrap" }}>
          {ex.oldRule}
        </span>
      </div>
      <motion.div
        animate={{ opacity: at("typing") ? 1 : 0, height: at("typing") ? 20 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: MONO, fontSize: 12.5, overflow: "hidden" }}
      >
        <span style={{ color: ACCENT, flexShrink: 0 }}>+</span>
        <span style={{ color: INK, whiteSpace: "nowrap" }}>{ex.newRule}</span>
      </motion.div>
      <motion.div
        animate={{ opacity: at("verified") ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          fontFamily: BODY,
          fontSize: 12.5,
          fontWeight: 600,
          color: ACCENT,
          marginTop: 6,
        }}
      >
        <span>✓</span> Rule updated
      </motion.div>

      {/* the retirement — a stale hook fades and gets tagged off */}
      <motion.div
        animate={{ opacity: at("retiring") ? 1 : 0, height: at("retiring") ? 34 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ overflow: "hidden", borderTop: at("retiring") ? "1px solid rgba(27,27,24,0.10)" : "none", marginTop: 10 }}
      >
        <motion.div
          animate={{ opacity: at("retired") ? 0.55 : 1, x: at("retired") ? -4 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 10 }}
        >
          <span style={{ fontFamily: MONO, fontSize: 12, color: INK_SOFT, whiteSpace: "nowrap" }}>{ex.deprecated}</span>
          <motion.span
            animate={{ opacity: at("retired") ? 1 : 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{
              padding: "1px 6px",
              border: `1px solid ${RETIRE}`,
              color: RETIRE,
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: "0.06em",
              flexShrink: 0,
            }}
          >
            ✕ Retired
          </motion.span>
        </motion.div>
      </motion.div>

      {/* the running tally — same summary-row treatment as Audits' priced
          verdict line */}
      <motion.div
        animate={{ opacity: at("summary") ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontFamily: BODY,
          fontSize: 13,
          fontWeight: 600,
          lineHeight: "22px",
          color: ACCENT,
          borderTop: "1px solid rgba(27,27,24,0.10)",
          marginTop: 10,
          paddingTop: 8,
        }}
      >
        <span style={{ fontSize: 11 }}>◆</span> 2 automations updated · 1 retired
      </motion.div>
    </div>
  );
}

function MaintainsContent() {
  return (
    <div style={{ width: 560 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", color: INK_SOFT, margin: "0 0 14px" }}>
        04 / 04
      </p>
      <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 64, color: INK, margin: "0 0 26px", lineHeight: 1 }}>
        Maintains
      </h3>

      <MaintainsVisual />

      <p style={{ fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, lineHeight: 1.6, margin: "26px 0 0", maxWidth: 480, textAlign: "left" }}>
        As tools and rules change, Ori rewrites the automations that depend on them and retires
        the ones that turn obsolete.
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
  // way back out to reveal the whole sheet — it never disappears; every
  // stage is printed on its own paper
  const tx = useSpring(useTransform(scrollYProgress, CAM_KEYS, CAM_TX, { ease: EASE }), SPRING);
  const ty = useSpring(useTransform(scrollYProgress, CAM_KEYS, CAM_TY, { ease: EASE }), SPRING);
  const scale = useSpring(useTransform(scrollYProgress, CAM_KEYS, CAM_SCALE, { ease: EASE }), SPRING);

  return (
    <div ref={zoomRef} style={{ position: "relative", height: `${SCENE_VH}vh` }}>
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
              <BuildsContent />
            </StagePrint>
            <StagePrint scrollYProgress={scrollYProgress} index={3}>
              <MaintainsContent />
            </StagePrint>
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
      {/* heading, task and ruler are one column, centred as a group — so the
          slack sits evenly above and below the whole block rather than all
          of it pooling under the ruler */}
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 64px",
          boxSizing: "border-box",
        }}
      >
        {/* section heading, left-aligned */}
        <div style={{ alignSelf: "flex-start" }}>
          <p style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.24em", color: INK_SOFT, margin: "0 0 14px" }}>
            THE KIND OF WORK ORI AUTOMATES
          </p>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 76, color: INK, margin: 0, lineHeight: 1 }}>
            Ori&rsquo;s Offer
          </h2>

          {/* printed-caption rule, like FIG. 01 under the hero wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
            <div style={{ width: 64, height: 1, background: "rgba(27,27,24,0.22)" }} />
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_SOFT }}>
              FIG. 04 — 3 TASKS AUTOMATED
            </span>
          </div>
        </div>

        {/* the current task + the ruler */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            marginTop: 56,
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
    <section id="what" style={{ position: "relative", background: "transparent" }}>
      <style>{FONT_IMPORT}</style>

      <CreaseZoom />

      <OffersRuler />
    </section>
  );
}
