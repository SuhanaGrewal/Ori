import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  animate,
  useScroll,
  useTransform,
  useSpring,
  useMotionTemplate,
  useMotionValueEvent,
} from "framer-motion";

import slackIcon from "./assets/slack-icon.svg";
import gmailIcon from "./assets/gmail-icon.svg";
import sheetsIcon from "./assets/sheets-icon.svg";
import craneAccent from "./assets/crane-accent.png";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const SERIF = "'Playfair Display', serif";
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap');`;

const ACCENT = "#5C8A94";
const ACCENT_SOFT = "#D9E7EA";
const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const LINE = "#E7E3D6";

// matches the Why section's heading rule
const PALE_TEAL = "#7FAEB8";

// same cotton-paper material as the Why sheets
const PAPER = "#FBF9F4";
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.16'/%3E%3C/svg%3E\")";
const SHEET_EDGE = "1px solid rgba(27,27,24,0.08)";
const SHEET_SHADOW = "0 3px 6px -2px rgba(27,27,24,0.10), 0 32px 64px -28px rgba(27,27,24,0.22)";

// calm, weighted settle — no bounce
const SETTLE = { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] };

/* ---------------------------------------------------------------------------
   Crease-pattern geometry (bird-base first stage), in an 800x800 crease space.
   Solid = mountain, dashed = valley. Focal targets sit on real intersections.
--------------------------------------------------------------------------- */

const SHEET = 560; // rendered paper size, px
const PAD = 30; // paper margin around the pattern
const K = (SHEET - PAD * 2) / 800; // crease-space -> local px

// mountains: both diagonals + the inscribed diamond through edge midpoints
const MOUNTAINS = [
  [0, 0, 800, 800],
  [800, 0, 0, 800],
  [400, 0, 800, 400],
  [800, 400, 400, 800],
  [400, 800, 0, 400],
  [0, 400, 400, 0],
];

// valleys: both medians + eight petal creases into the diamond midpoints
const VALLEYS = [
  [400, 0, 400, 800],
  [0, 400, 800, 400],
  [400, 0, 200, 200],
  [400, 0, 600, 200],
  [800, 400, 600, 200],
  [800, 400, 600, 600],
  [400, 800, 600, 600],
  [400, 800, 200, 600],
  [0, 400, 200, 600],
  [0, 400, 200, 200],
];

// one focal intersection per stage
const TARGETS = [
  { fx: 200, fy: 200, s: 2.1 },
  { fx: 600, fy: 200, s: 2.3 },
  { fx: 400, fy: 400, s: 2.7 },
  { fx: 600, fy: 600, s: 2.3 },
  { fx: 200, fy: 600, s: 2.0 },
];

const KEYS = [0.1, 0.3, 0.5, 0.7, 0.9];
const localX = (fx) => PAD + fx * K;
const localY = (fy) => PAD + fy * K;

function CreaseSVG({ stroke, strokeWidth }) {
  return (
    <svg
      viewBox="0 0 800 800"
      style={{ position: "absolute", left: PAD, top: PAD, width: SHEET - PAD * 2, height: SHEET - PAD * 2 }}
    >
      {MOUNTAINS.map(([x1, y1, x2, y2], i) => (
        <line key={`m${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} />
      ))}
      {VALLEYS.map(([x1, y1, x2, y2], i) => (
        <line
          key={`v${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray="10 9"
        />
      ))}
    </svg>
  );
}

/* -------------------------------- stage visuals -------------------------- */

function IconTile({ src, alt }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        background: "#FFFFFF",
        border: `1px solid ${LINE}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 5px -2px rgba(27,27,24,0.18)",
      }}
    >
      <img src={src} alt={alt} style={{ width: 22, height: 22, objectFit: "contain" }} />
    </div>
  );
}

function ObservesVisual() {
  const tiles = [
    { src: slackIcon, alt: "Slack" },
    { src: gmailIcon, alt: "Gmail" },
    { src: sheetsIcon, alt: "Google Sheets" },
  ];
  return (
    <div style={{ position: "relative", width: 300, height: 152, margin: "24px 0" }}>
      {tiles.map((t, i) => (
        <div key={t.alt} style={{ position: "absolute", left: 0, top: i * 54 }}>
          <IconTile src={t.src} alt={t.alt} />
        </div>
      ))}

      <svg style={{ position: "absolute", inset: 0 }} width={300} height={152}>
        {tiles.map((t, i) => (
          <motion.line
            key={t.alt}
            x1={46}
            y1={20 + i * 54}
            x2={236}
            y2={76}
            stroke={ACCENT}
            strokeWidth={1.2}
            strokeDasharray="4 7"
            animate={{ strokeDashoffset: [0, -22] }}
            transition={{ duration: 1.15 + i * 0.18, ease: "linear", repeat: Infinity }}
            opacity={0.7}
          />
        ))}
      </svg>

      <motion.img
        src={craneAccent}
        alt=""
        animate={{ opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
        style={{
          position: "absolute",
          right: 8,
          top: 52,
          width: 48,
          height: 48,
          filter: `drop-shadow(0 0 10px ${ACCENT_SOFT})`,
        }}
      />
    </div>
  );
}

const LOG_LINES = [
  "14:02  slack.com/msg      → sheet.update",
  "14:03  gmail.thread       → crm.field",
  "14:05  sheets.edit        → report.rollup",
  "14:07  slack.reaction     → ticket.close",
  "14:09  gmail.attachment   → drive.file",
  "14:11  sheets.formula     → dashboard.sync",
];

function AuditsVisual() {
  const fade = "linear-gradient(transparent, black 18%, black 82%, transparent)";
  return (
    <div
      style={{
        height: 118,
        overflow: "hidden",
        margin: "24px 0",
        WebkitMaskImage: fade,
        maskImage: fade,
      }}
    >
      <motion.div
        animate={{ y: [0, -120] }}
        transition={{ duration: 7.5, ease: "linear", repeat: Infinity }}
      >
        {[...LOG_LINES, ...LOG_LINES].map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: INK_SOFT,
              lineHeight: "20px",
              whiteSpace: "pre",
            }}
          >
            {l}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function DetectsVisual() {
  const [n, setN] = useState(0);
  const [tagIdx, setTagIdx] = useState(0);
  const tags = ["errors avoided", "time reclaimed"];

  useEffect(() => {
    const controls = animate(0, 6, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => setN(Math.round(v)),
    });
    const iv = setInterval(() => setTagIdx((t) => (t + 1) % tags.length), 1600);
    return () => {
      controls.stop();
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ margin: "24px 0" }}>
      <p style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 64, color: INK, margin: 0, lineHeight: 1 }}>
        {n}
        <span style={{ fontSize: 30, fontWeight: 500 }}> hrs</span>
        <span style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, fontWeight: 400 }}> / week, reclaimed</span>
      </p>
      <div style={{ height: 20, marginTop: 12 }}>
        <AnimatePresence mode="wait">
          <motion.p
            key={tagIdx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: INK_SOFT,
              margin: 0,
            }}
          >
            {tags[tagIdx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DrawnLine({ delay }) {
  return (
    <svg width={64} height={8} style={{ flexShrink: 0 }}>
      <motion.line
        x1={0}
        y1={4}
        x2={64}
        y2={4}
        stroke={ACCENT}
        strokeWidth={1.4}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, delay, ease: "easeOut" }}
      />
    </svg>
  );
}

function BuildsVisual() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0", height: 60 }}>
      <img src={gmailIcon} alt="Gmail" style={{ width: 30, height: 30, objectFit: "contain" }} />
      <DrawnLine delay={0.25} />
      <img src={sheetsIcon} alt="Google Sheets" style={{ width: 30, height: 30, objectFit: "contain" }} />
      <DrawnLine delay={1.0} />
      <img src={slackIcon} alt="Slack" style={{ width: 30, height: 30, objectFit: "contain" }} />
    </div>
  );
}

function MaintainsVisual() {
  // one shared loop: line breaks -> label appears -> line repairs
  const LOOP = { duration: 5.6, repeat: Infinity, times: [0, 0.18, 0.3, 0.58, 0.74, 1] };
  return (
    <div style={{ position: "relative", width: 300, height: 92, margin: "24px 0" }}>
      <div style={{ position: "absolute", left: 0, top: 30 }}>
        <IconTile src={sheetsIcon} alt="Google Sheets" />
      </div>
      <div style={{ position: "absolute", right: 44, top: 30 }}>
        <IconTile src={slackIcon} alt="Slack" />
      </div>

      <svg style={{ position: "absolute", left: 46, top: 48 }} width={168} height={4}>
        {/* left half stays put; right half retracts to open a tear, then re-forms */}
        <line x1={0} y1={2} x2={78} y2={2} stroke={ACCENT} strokeWidth={1.4} />
        <motion.line
          x1={168}
          y1={2}
          x2={90}
          y2={2}
          stroke={ACCENT}
          strokeWidth={1.4}
          animate={{ pathLength: [1, 1, 0.12, 0.12, 1, 1] }}
          transition={{ ...LOOP, ease: "easeInOut" }}
        />
      </svg>

      <motion.p
        animate={{ opacity: [0, 0, 1, 1, 0, 0] }}
        transition={LOOP}
        style={{
          position: "absolute",
          left: 92,
          top: 14,
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: "0.08em",
          color: INK_SOFT,
          margin: 0,
          whiteSpace: "nowrap",
        }}
      >
        Legal review added
      </motion.p>

      {/* steady "alive" pulse */}
      <motion.div
        animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.3, 1] }}
        transition={{ duration: 1.7, ease: "easeInOut", repeat: Infinity }}
        style={{
          position: "absolute",
          right: 24,
          top: 46,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: ACCENT,
        }}
      />
    </div>
  );
}

/* ------------------------------ stage content ---------------------------- */

const STAGES = [
  {
    title: "Observes",
    Visual: ObservesVisual,
    body: "Ori connects directly to the tools your team runs on — Slack, Gmail, Google Sheets — and reads what's really happening, as it happens.",
  },
  {
    title: "Audits",
    Visual: AuditsVisual,
    body: "In the background, Ori continuously audits that activity — mining it for the patterns no one has time to notice, the same way process-mining tools reconstruct how work actually happens.",
  },
  {
    title: "Detects",
    Visual: DetectsVisual,
    body: "Once a pattern repeats enough to matter, Ori calculates what it's actually costing — hours lost, errors introduced — and proposes the fix.",
  },
  {
    title: "Builds",
    Visual: BuildsVisual,
    body: "You approve. Ori builds. No workflow canvas, no dragging nodes, no code — Ori writes and ships the automation itself.",
  },
  {
    title: "Maintains",
    Visual: MaintainsVisual,
    body: "When a tool updates or a process shifts, Ori repairs the automation to match — and quietly retires the ones that no longer make sense. No one has to ask.",
  },
];

// dashed instruction-arrow + numbered tag that fades in as the camera settles
function FoldTag({ scrollYProgress, index }) {
  const s0 = index * 0.2;
  const last = index === TARGETS.length - 1;
  // input offsets must stay within [0,1] — framer binds these to native
  // ScrollTimeline keyframes. The last tag simply holds at 1.
  const opacity = useTransform(
    scrollYProgress,
    last ? [s0 + 0.05, s0 + 0.095] : [s0 + 0.05, s0 + 0.095, s0 + 0.15, s0 + 0.19],
    last ? [0, 1] : [0, 1, 1, 0]
  );

  return (
    <motion.div style={{ opacity, position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: SHEET / 2 + 62,
          top: SHEET / 2 - 104,
          border: `1px solid ${INK}`,
          background: PAPER,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.1em",
          color: INK,
          padding: "3px 7px",
        }}
      >
        0{index + 1}
      </div>
      <svg
        style={{ position: "absolute", left: SHEET / 2 + 24, top: SHEET / 2 - 78 }}
        width={52}
        height={56}
        viewBox="0 0 52 56"
      >
        <path
          d="M46 6 C 30 14, 16 30, 8 46"
          fill="none"
          stroke={INK}
          strokeWidth={1.2}
          strokeDasharray="5 4"
        />
        <path d="M4 38 L8 48 L16 44" fill="none" stroke={INK} strokeWidth={1.2} />
      </svg>
    </motion.div>
  );
}

/* --------------------------------- section ------------------------------- */

export default function WhatSection() {
  const zoomRef = useRef(null);
  const [stage, setStage] = useState(0);

  const { scrollYProgress } = useScroll({
    target: zoomRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setStage(Math.min(TARGETS.length - 1, Math.max(0, Math.floor(v * TARGETS.length))));
  });

  // scroll-linked camera: continuous interpolation between focal points,
  // smoothed with springs, fully reversible
  const spring = { stiffness: 60, damping: 24, mass: 1 };
  const cx = SHEET / 2;
  const txRaw = useTransform(scrollYProgress, KEYS, TARGETS.map((t) => t.s * (cx - localX(t.fx))));
  const tyRaw = useTransform(scrollYProgress, KEYS, TARGETS.map((t) => t.s * (cx - localY(t.fy))));
  const scaleRaw = useTransform(scrollYProgress, KEYS, TARGETS.map((t) => t.s));
  const tx = useSpring(txRaw, spring);
  const ty = useSpring(tyRaw, spring);
  const scale = useSpring(scaleRaw, spring);

  // spotlight mask trailing the same camera: nearby creases at full contrast,
  // the rest of the pattern sits at ~20%
  const mxRaw = useTransform(scrollYProgress, KEYS, TARGETS.map((t) => localX(t.fx)));
  const myRaw = useTransform(scrollYProgress, KEYS, TARGETS.map((t) => localY(t.fy)));
  const mx = useSpring(mxRaw, spring);
  const my = useSpring(myRaw, spring);
  const spotlight = useMotionTemplate`radial-gradient(circle 120px at ${mx}px ${my}px, black 55%, transparent 100%)`;

  const stageDef = STAGES[stage];

  return (
    <section style={{ position: "relative", background: "#FFFFFF" }}>
      <style>{FONT_IMPORT}</style>

      {/* section heading — same rule + serif treatment as the Why section */}
      <div style={{ display: "flex", alignItems: "center", gap: 28, paddingTop: 110, paddingBottom: 40 }}>
        <div
          style={{
            width: 140,
            height: 2,
            borderRadius: 2,
            background: `linear-gradient(90deg, rgba(127,174,184,0), ${PALE_TEAL})`,
          }}
        />
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 88, color: INK, margin: 0, lineHeight: 1 }}>
          What.
        </h2>
      </div>

      {/* sticky crease-zoom */}
      <div ref={zoomRef} style={{ position: "relative", height: "500vh" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
          {/* the paper, pinned left-of-center */}
          <div
            style={{
              position: "absolute",
              left: "34%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: SHEET,
              height: SHEET,
            }}
          >
            <motion.div
              style={{
                x: tx,
                y: ty,
                scale,
                transformOrigin: "50% 50%",
                position: "absolute",
                inset: 0,
                background: PAPER,
                border: SHEET_EDGE,
                boxShadow: SHEET_SHADOW,
              }}
            >
              <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, pointerEvents: "none" }} />

              {/* full pattern, receded */}
              <div style={{ position: "absolute", inset: 0, opacity: 0.2 }}>
                <CreaseSVG stroke={INK} strokeWidth={1.1} />
              </div>

              {/* spotlit copy — only the creases near the focal point at full contrast */}
              <motion.div
                style={{
                  position: "absolute",
                  inset: 0,
                  WebkitMaskImage: spotlight,
                  maskImage: spotlight,
                }}
              >
                <CreaseSVG stroke={INK} strokeWidth={1.1} />
              </motion.div>
            </motion.div>

            {/* fold-diagram tag + arrow, pinned beside the focused crease */}
            {TARGETS.map((t, i) => (
              <FoldTag key={i} scrollYProgress={scrollYProgress} index={i} />
            ))}
          </div>

          {/* per-stage overlay content, beside the zoomed crease */}
          <div
            style={{
              position: "absolute",
              left: "60%",
              top: "50%",
              transform: "translateY(-50%)",
              width: "min(420px, 32vw)",
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={SETTLE}
              >
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    letterSpacing: "0.14em",
                    color: INK_SOFT,
                    margin: "0 0 12px",
                  }}
                >
                  0{stage + 1} / 05
                </p>
                <h3
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 600,
                    fontSize: 40,
                    color: INK,
                    margin: 0,
                    lineHeight: 1.15,
                  }}
                >
                  {stageDef.title}
                </h3>

                <stageDef.Visual />

                <p
                  style={{
                    fontFamily: BODY,
                    fontSize: 15.5,
                    color: INK_SOFT,
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {stageDef.body}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* closing line */}
      <div style={{ display: "flex", justifyContent: "center", padding: "110px 24px 90px" }}>
        <p
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            fontSize: 32,
            color: INK,
            lineHeight: 1.45,
            textAlign: "center",
            maxWidth: 880,
            margin: 0,
          }}
        >
          Company Brain tools understand how you work. Ori is Company Brain{" "}
          <em style={{ fontStyle: "italic" }}>and</em> Company Hands — understanding that actually
          executes.
        </p>
      </div>
    </section>
  );
}
