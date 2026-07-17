import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, User, MessageSquare, ClipboardList, ArrowRight, Zap, Check } from "lucide-react";

import formsIcon from "./assets/forms-icon.webp";
import outlookIcon from "./assets/outlook-icon.webp";
import excelIcon from "./assets/excel-icon.webp";
import craneAccent from "./assets/crane-accent.png";
import craneFoldVideo from "./assets/crane-fold-alpha.webm";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const MONO = "'SF Mono', Menlo, monospace";
const SERIF = "'CMU Serif', 'Old Standard TT', serif";
const FONT_IMPORT = `@import url('https://fonts.cdnfonts.com/css/cmu-serif'); @import url('https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;1,400&display=swap');`;

const INK = "#57564F";
const INK_SOFT = "#8B897E";
const LINE = "#E7E3D6";
const ACCENT = "#5C8A94";
const ACCENT_SOFT = "#D9E7EA";
const PANEL_BG = "#ceedf5";

const GRID_LINE = "#D6D3CB";
const GRID_HEADER_BG = "#F3F2ED";

const CARD_TITLE = { fontFamily: SERIF, fontWeight: 400, fontSize: 15, color: INK };
const CARD_STYLE = {
  position: "relative", background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16,
  padding: "20px 22px", width: 320, boxShadow: "0 12px 30px rgba(27,27,24,0.09)",
};

const STAGES = [
  { key: "copypaste", label: "Manual copy-paste", duration: 6400 },
  { key: "notify", label: "Suggests automation", duration: 3600 },
  { key: "review", label: "Review workflow", duration: 4200 },
  { key: "approve", label: "Approve", duration: 2200 },
  { key: "automate", label: "Automated", duration: 4200 },
  { key: "fold", label: "Becomes Ori", duration: 2200 },
];

const COL_LETTERS = ["A", "B", "C"];
const FIELD_NAMES = ["Email", "Name", "Feedback"];

const MANUAL_ROWS = [
  { email: "jordan.k@ori.ai", name: "Jordan Kim", feedback: "Loved the onboarding flow" },
  { email: "priya.s@ori.ai", name: "Priya Shah", feedback: "Checkout was confusing" },
  { email: "alex.t@ori.ai", name: "Alex Tran", feedback: "Great support response" },
];

const AUTO_ROWS = [
  { email: "morgan.l@ori.ai", name: "Morgan Lee", feedback: "Pricing page needs work" },
  { email: "sam.w@ori.ai", name: "Sam Wu", feedback: "Mobile app is smooth" },
  { email: "dana.r@ori.ai", name: "Dana Rivera", feedback: "Loved the new dashboard" },
];

function CraneBadge() {
  return (
    <img
      src={craneAccent}
      alt=""
      style={{
        position: "absolute", top: -20, right: -16, width: 44, height: 44,
        filter: "drop-shadow(0 3px 6px rgba(27,27,24,0.15))",
      }}
    />
  );
}

function SheetGrid({ rows, cellValue, activeCell, rowHighlight, fxText }) {
  return (
    <div style={{ border: `1px solid ${GRID_LINE}`, borderRadius: 4, overflow: "hidden", width: 330, boxShadow: "0 6px 18px rgba(27,27,24,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "#FFFFFF", borderBottom: `1px solid ${GRID_LINE}` }}>
        <span style={{ fontFamily: BODY, fontSize: 9, fontStyle: "italic", color: "#A8A59A" }}>fx</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: INK_SOFT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {fxText || ""}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "24px 1.3fr 1fr 1.3fr" }}>
        <div style={{ background: GRID_HEADER_BG, borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}` }} />
        {COL_LETTERS.map((c) => (
          <div key={c} style={{
            background: GRID_HEADER_BG, borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}`,
            textAlign: "center", fontFamily: BODY, fontSize: 8.5, fontWeight: 600, color: INK_SOFT, padding: "3px 0",
          }}>
            {c}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "24px 1.3fr 1fr 1.3fr" }}>
        <div style={{ background: GRID_HEADER_BG, borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}`, textAlign: "center", fontFamily: BODY, fontSize: 8, color: INK_SOFT, padding: "5px 0" }}>1</div>
        {FIELD_NAMES.map((f) => (
          <div key={f} style={{ borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}`, padding: "5px 7px", fontFamily: BODY, fontSize: 9.5, fontWeight: 700, color: INK }}>
            {f}
          </div>
        ))}
      </div>

      {rows.map((row, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1.3fr 1fr 1.3fr" }}>
          <div style={{ background: GRID_HEADER_BG, borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}`, textAlign: "center", fontFamily: BODY, fontSize: 8, color: INK_SOFT, padding: "5px 0" }}>
            {i + 2}
          </div>
          {["email", "name", "feedback"].map((field, j) => {
            const isActiveCell = activeCell && activeCell.row === i && activeCell.col === j;
            const isActiveRow = rowHighlight === i;
            const value = cellValue(i, j, row);
            return (
              <div
                key={field}
                style={{
                  borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}`,
                  padding: "5px 7px", fontFamily: BODY, fontSize: 9.5, color: INK,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  outline: isActiveCell ? `2px solid ${ACCENT}` : "none", outlineOffset: "-1px",
                  background: isActiveCell || isActiveRow ? ACCENT_SOFT : "#FFFFFF", position: "relative",
                }}
              >
                {value}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StageCopyPaste() {
  const [revealed, setRevealed] = useState({});
  const [activeCell, setActiveCell] = useState(null);
  const [fxText, setFxText] = useState("");

  useEffect(() => {
    const sequence = [];
    MANUAL_ROWS.forEach((row, i) => {
      sequence.push({ row: i, col: 0, value: row.email });
      sequence.push({ row: i, col: 1, value: row.name });
      sequence.push({ row: i, col: 2, value: row.feedback });
    });

    let idx = 0;
    const timers = [];
    const step = () => {
      if (idx >= sequence.length) return;
      const cell = sequence[idx];
      setActiveCell({ row: cell.row, col: cell.col });
      setFxText(`${COL_LETTERS[cell.col]}${cell.row + 2}  —  pasting…`);
      const t1 = setTimeout(() => {
        setRevealed((prev) => ({ ...prev, [`${cell.row}-${cell.col}`]: cell.value }));
        setFxText(`${COL_LETTERS[cell.col]}${cell.row + 2}  ${cell.value}`);
        idx += 1;
        const t2 = setTimeout(step, 280);
        timers.push(t2);
      }, 260);
      timers.push(t1);
    };
    step();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 400, color: INK_SOFT }}>
        Copying form responses by hand
      </div>
      <SheetGrid
        rows={MANUAL_ROWS}
        cellValue={(i, j) => revealed[`${i}-${j}`] || ""}
        activeCell={activeCell}
        fxText={fxText}
      />
    </div>
  );
}

function StageNotify() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={CARD_STYLE}
    >
      <CraneBadge />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 24, height: 24, borderRadius: 7, background: ACCENT_SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Zap size={12} color={ACCENT} />
        </div>
        <span style={CARD_TITLE}>Pattern detected</span>
      </div>

      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ fontFamily: BODY, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: INK_SOFT, marginBottom: 5, textTransform: "uppercase" }}>
          What's happening
        </div>
        <div style={{ fontFamily: BODY, fontSize: 12, color: INK, lineHeight: 1.5 }}>
          New form responses are verified and copied into this sheet by hand, every time.
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: BODY, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: ACCENT, marginBottom: 5, textTransform: "uppercase" }}>
          Ori's offer
        </div>
        <div style={{ fontFamily: BODY, fontSize: 12, color: INK, lineHeight: 1.5 }}>
          Automatically verify the sender and sync their response into this sheet.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 500, color: "#B8B5A9", padding: "8px 12px" }}>
          Dismiss
        </div>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 5, fontFamily: BODY, fontSize: 10, fontWeight: 600,
            color: "#FAFAF6", background: ACCENT, padding: "8px 16px", borderRadius: 8,
          }}
        >
          Review
        </div>
      </div>
    </motion.div>
  );
}

function ReviewRow({ Icon, label, detail, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}
    >
      <Icon size={13} color={ACCENT} />
      <div style={{ fontFamily: BODY, fontSize: 10.5, color: INK, flex: 1 }}>{label}</div>
      <div style={{ fontFamily: BODY, fontSize: 9.5, color: INK_SOFT }}>{detail}</div>
    </motion.div>
  );
}

function AppTile({ src, name, sub, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
    >
      <img src={src} alt={name} style={{ width: 34, height: 34, objectFit: "contain" }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: BODY, fontSize: 8.5, fontWeight: 600, color: INK }}>{name}</div>
        <div style={{ fontFamily: BODY, fontSize: 7, color: INK_SOFT }}>{sub}</div>
      </div>
    </motion.div>
  );
}

function StageReview() {
  return (
    <div style={CARD_STYLE}>
      <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 400, color: INK_SOFT, marginBottom: 12 }}>Review workflow</div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
        <AppTile src={formsIcon} name="Forms" sub="New response" delay={0.05} />
        <ArrowRight size={13} color={INK_SOFT} />
        <AppTile src={outlookIcon} name="Outlook" sub="Verify sender" delay={0.15} />
        <ArrowRight size={13} color={INK_SOFT} />
        <AppTile src={excelIcon} name="Excel" sub="Write row" delay={0.25} />
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 9 }}>
        <ReviewRow Icon={Mail} label="Email" detail="verified via Outlook" delay={0.4} />
        <ReviewRow Icon={User} label="Name" detail="→ Column B" delay={0.52} />
        <ReviewRow Icon={MessageSquare} label="Feedback" detail="→ Column C" delay={0.64} />
      </div>
    </div>
  );
}

function StageApprove() {
  const [tapped, setTapped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTapped(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ ...CARD_STYLE, textAlign: "center" }}>
      <CraneBadge />
      <div style={{ ...CARD_TITLE, marginBottom: 16 }}>Turn this into an automation?</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 500, color: "#B8B5A9", padding: "8px 14px" }}>
          Dismiss
        </div>
        <motion.div
          animate={tapped ? { scale: [1, 0.9, 1.05, 1] } : {}}
          transition={{ duration: 0.35 }}
          style={{
            display: "flex", alignItems: "center", gap: 5, fontFamily: BODY, fontSize: 10, fontWeight: 600,
            color: "#FAFAF6", background: ACCENT, padding: "8px 16px", borderRadius: 8,
          }}
        >
          {tapped ? (<><Check size={11} /> Approved</>) : "Approve"}
        </motion.div>
      </div>
    </div>
  );
}

function StageAutomate() {
  const [visibleRows, setVisibleRows] = useState(0);
  const [activeRow, setActiveRow] = useState(null);
  const [fxText, setFxText] = useState("Live — auto-syncing");

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      if (i >= AUTO_ROWS.length) {
        clearInterval(iv);
        return;
      }
      setActiveRow(i);
      setVisibleRows(i + 1);
      setFxText(`Row ${i + 2}  —  ${AUTO_ROWS[i].email}`);
      setTimeout(() => setActiveRow(null), 260);
      i += 1;
    }, 550);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 400, color: INK_SOFT }}>
        Automation Deployed
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: ACCENT_SOFT, borderRadius: 20, padding: "4px 10px" }}>
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }}
        />
        <span style={{ fontFamily: BODY, fontSize: 9, fontWeight: 600, color: ACCENT, letterSpacing: "0.02em" }}>
          Live — auto-syncing
        </span>
      </div>
      <SheetGrid
        rows={AUTO_ROWS}
        cellValue={(i, j, row) => {
          if (i >= visibleRows) return "";
          return [row.email, row.name, row.feedback][j];
        }}
        activeCell={null}
        rowHighlight={activeRow}
        fxText={fxText}
      />
    </div>
  );
}

function StageFold() {
  // crane-fold-alpha.webm is a VP8-alpha video: the simulator's white
  // background is keyed out to real transparency, so the crane floats on
  // whatever is behind the panel (the desk shows through seamlessly).
  return (
    <video
      src={craneFoldVideo}
      autoPlay
      muted
      playsInline
      style={{ width: 400, height: 400, objectFit: "cover", display: "block" }}
    />
  );
}

export default function WorkflowBuildDemo({ activeStage }) {
  // controlled mode: when a numeric activeStage is passed (e.g. driven by
  // scroll in WhatSection), the internal timer is disabled entirely
  const controlled = typeof activeStage === "number";
  const [internalIndex, setInternalIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (controlled || paused) return;
    const t = setTimeout(() => setInternalIndex((i) => (i + 1) % STAGES.length), STAGES[internalIndex].duration);
    return () => clearTimeout(t);
  }, [internalIndex, paused, controlled]);

  const stageIndex = controlled
    ? Math.max(0, Math.min(STAGES.length - 1, activeStage))
    : internalIndex;

  const isFold = STAGES[stageIndex].key === "fold";

  const renderStage = () => {
    switch (STAGES[stageIndex].key) {
      case "copypaste": return <StageCopyPaste />;
      case "notify": return <StageNotify />;
      case "review": return <StageReview />;
      case "approve": return <StageApprove />;
      case "automate": return <StageAutomate />;
      case "fold": return <StageFold />;
      default: return null;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: BODY }}>
      <style>{FONT_IMPORT}</style>
      <motion.div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        animate={{
          backgroundColor: isFold ? "rgba(197,243,255,0)" : PANEL_BG,
          boxShadow: isFold
            ? "0 2px 5px -1px rgba(27,27,24,0), 0 34px 60px -26px rgba(27,27,24,0)"
            : "0 2px 5px -1px rgba(27,27,24,0.16), 0 34px 60px -26px rgba(27,27,24,0.30)",
        }}
        transition={{ duration: 0.25, delay: 0.25 }}
        style={{
          position: "relative", width: 400, height: 400, background: PANEL_BG,
          borderRadius: 0, display: "flex", alignItems: "center",
          justifyContent: "center", overflow: "hidden",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div key={stageIndex} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {renderStage()}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
