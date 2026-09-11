import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, CheckCircle2, Inbox, Moon, CalendarClock, Reply, Send, ShoppingCart, Bot,
} from "lucide-react";

import craneAccent from "./assets/crane-accent.png";
import craneFoldVideo from "./assets/crane-fold-alpha.webm";
import craneUnfoldVideo from "./assets/crane-fold-alpha-reverse.webm";

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
  { key: "inbox", label: "Reading the inbox", duration: 6400 },
  { key: "digest", label: "Nightly digest", duration: 4200 },
  { key: "conflict", label: "Scheduling conflict", duration: 4200 },
  { key: "draft", label: "Drafting a reply", duration: 4800 },
  { key: "shopping", label: "Spawning agents", duration: 4600 },
  { key: "fold", label: "Becomes Ori", duration: 2200 },
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

// STAGE 1 — reading across the inbox: rows highlight one at a time, each
// pulling a short "extracted" chip out into a strip beneath the list
const INBOX_EMAILS = [
  { from: "Dr. Patel's Office", subject: "Appointment reminder", snippet: "Cleaning confirmed for Thursday at 3:00 PM.", extract: "Dentist — Thu 3:00 PM" },
  { from: "Delta Air Lines", subject: "Your itinerary is confirmed", snippet: "Flight DL 1847 departs 7:45 AM Saturday, SFO.", extract: "Flight DL1847 — Sat 7:45 AM" },
  { from: "Morgan · Accounting", subject: "Invoice #4471 due Friday", snippet: "Payment of $1,240 is due by end of day Friday.", extract: "Invoice due Fri — $1,240" },
];

function StageEmailRead() {
  const [activeRow, setActiveRow] = useState(null);
  const [chips, setChips] = useState([]);

  useEffect(() => {
    let i = 0;
    const timers = [];
    const step = () => {
      if (i >= INBOX_EMAILS.length) return;
      const email = INBOX_EMAILS[i];
      setActiveRow(i);
      const t1 = setTimeout(() => {
        setChips((prev) => [...prev, email.extract]);
        setActiveRow(null);
        i += 1;
        const t2 = setTimeout(step, 320);
        timers.push(t2);
      }, 900);
      timers.push(t1);
    };
    step();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 400, color: INK_SOFT }}>
        Reading across your inbox
      </div>

      <div style={{ border: `1px solid ${GRID_LINE}`, borderRadius: 8, overflow: "hidden", width: 340, background: "#FFFFFF", boxShadow: "0 6px 18px rgba(27,27,24,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", background: GRID_HEADER_BG, borderBottom: `1px solid ${GRID_LINE}` }}>
          <Inbox size={11} color={INK_SOFT} />
          <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, color: INK_SOFT }}>Inbox — 3 unread</span>
        </div>

        {INBOX_EMAILS.map((email, i) => (
          <div
            key={email.subject}
            style={{
              display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px",
              borderBottom: i < INBOX_EMAILS.length - 1 ? `1px solid ${GRID_LINE}` : "none",
              background: activeRow === i ? ACCENT_SOFT : "#FFFFFF",
              borderLeft: activeRow === i ? `2px solid ${ACCENT}` : "2px solid transparent",
              transition: "background 0.25s ease, border-color 0.25s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 700, color: INK }}>{email.from}</span>
              {chips.includes(email.extract) && <Check size={12} color={ACCENT} />}
            </div>
            <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, color: INK }}>{email.subject}</span>
            <span
              style={{
                fontFamily: BODY, fontSize: 9.5, color: INK_SOFT,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {email.snippet}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, width: 340, minHeight: 22 }}>
        <AnimatePresence>
          {chips.map((chip) => (
            <motion.span
              key={chip}
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              style={{
                fontFamily: MONO, fontSize: 9, color: ACCENT, background: ACCENT_SOFT,
                padding: "4px 8px", borderRadius: 20, whiteSpace: "nowrap",
              }}
            >
              {chip}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// STAGE 2 — nightly digest: same card chrome as the notification card below,
// but its body is a running summary rather than a proposal to approve
const DIGEST_ITEMS = [
  "3 replies drafted, ready to send",
  "Flight check-in opens 6:00 AM tomorrow",
  "Invoice #4471 due Friday — reminder set",
];

function StageDigest() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setVisible(i);
      if (i >= DIGEST_ITEMS.length) clearInterval(iv);
    }, 500);
    return () => clearInterval(iv);
  }, []);

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
          <Moon size={12} color={ACCENT} />
        </div>
        <span style={CARD_TITLE}>Tonight's digest</span>
      </div>

      <div style={{ marginBottom: 18 }}>
        {DIGEST_ITEMS.map((item, i) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: i < visible ? 1 : 0, x: i < visible ? 0 : -6 }}
            transition={{ duration: 0.3 }}
            style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0" }}
          >
            <Check size={12} color={ACCENT} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontFamily: BODY, fontSize: 12, color: INK, lineHeight: 1.5 }}>{item}</span>
          </motion.div>
        ))}
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
          Open digest
        </div>
      </div>
    </motion.div>
  );
}

// shared notification-card chrome (badge / icon+title / what's-happening /
// Ori's-offer / dismiss+primary) — the format the scheduling-conflict stage
// below reuses as-is
function NotificationCard({
  icon: Icon, title, whatLabel = "What's happening", what,
  offerLabel = "Ori's offer", offer, primaryLabel = "Review", secondaryLabel = "Dismiss",
}) {
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
          <Icon size={12} color={ACCENT} />
        </div>
        <span style={CARD_TITLE}>{title}</span>
      </div>

      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ fontFamily: BODY, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: INK_SOFT, marginBottom: 5, textTransform: "uppercase" }}>
          {whatLabel}
        </div>
        <div style={{ fontFamily: BODY, fontSize: 12, color: INK, lineHeight: 1.5 }}>{what}</div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: BODY, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: ACCENT, marginBottom: 5, textTransform: "uppercase" }}>
          {offerLabel}
        </div>
        <div style={{ fontFamily: BODY, fontSize: 12, color: INK, lineHeight: 1.5 }}>{offer}</div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 500, color: "#B8B5A9", padding: "8px 12px" }}>
          {secondaryLabel}
        </div>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 5, fontFamily: BODY, fontSize: 10, fontWeight: 600,
            color: "#FAFAF6", background: ACCENT, padding: "8px 16px", borderRadius: 8,
          }}
        >
          {primaryLabel}
        </div>
      </div>
    </motion.div>
  );
}

// STAGE 3 — scheduling conflict, in the same notification-card format above
function StageConflict() {
  return (
    <NotificationCard
      icon={CalendarClock}
      title="Scheduling conflict"
      what="Team Sync (2:00 PM) now overlaps Client Call (2:15 PM) on Thursday."
      offer="Move Team Sync to 3:00 PM — everyone on the team is free then."
      primaryLabel="Reschedule"
    />
  );
}

// STAGE 4 — drafting a reply: the message types itself out into a compose
// box, then the send button taps into a confirmed state
const DRAFT_TEXT = "Thanks for looping me in — Thursday works well. I'll send over a calendar invite shortly.";

function StageDraftReply() {
  const [typed, setTyped] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setTyped(DRAFT_TEXT.slice(0, i));
      if (i >= DRAFT_TEXT.length) {
        clearInterval(iv);
        setTimeout(() => setSent(true), 500);
      }
    }, 22);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ ...CARD_STYLE, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 24, height: 24, borderRadius: 7, background: ACCENT_SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Reply size={12} color={ACCENT} />
        </div>
        <span style={CARD_TITLE}>Re: Thursday sync</span>
      </div>

      <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${LINE}`, fontFamily: BODY, fontSize: 10.5, color: INK_SOFT }}>
        <span style={{ fontWeight: 700, color: INK }}>Jordan Kim</span> — "Can we grab 30 min to align before the client call?"
      </div>

      <div style={{ minHeight: 64, fontFamily: BODY, fontSize: 11.5, color: INK, lineHeight: 1.6 }}>
        {typed}
        {!sent && (
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            style={{ display: "inline-block", width: 2, height: 12, background: ACCENT, marginLeft: 2, verticalAlign: "middle" }}
          />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <motion.div
          animate={sent ? { scale: [1, 0.92, 1.05, 1] } : {}}
          transition={{ duration: 0.35 }}
          style={{
            display: "flex", alignItems: "center", gap: 5, fontFamily: BODY, fontSize: 10, fontWeight: 600,
            color: "#FAFAF6", background: ACCENT, padding: "8px 16px", borderRadius: 8,
          }}
        >
          {sent ? (<><Check size={11} /> Sent</>) : (<><Send size={11} /> Send</>)}
        </motion.div>
      </div>
    </div>
  );
}

// STAGE 5 — spawning agents to run a shopping errand: three sub-agents fan
// out and check off their piece of the task, then the order confirms
const SHOPPING_AGENTS = [
  { task: "Comparing prices across 5 stores", delay: 700 },
  { task: "Reading reviews for the top picks", delay: 1500 },
  { task: "Applying the best discount code", delay: 2300 },
];

function StageShoppingAgents() {
  const [done, setDone] = useState([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const timers = SHOPPING_AGENTS.map((agent, i) =>
      setTimeout(() => setDone((prev) => [...prev, i]), agent.delay)
    );
    const finalTimer = setTimeout(() => setFinished(true), 3100);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(finalTimer);
    };
  }, []);

  return (
    <div style={{ ...CARD_STYLE, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 24, height: 24, borderRadius: 7, background: ACCENT_SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ShoppingCart size={12} color={ACCENT} />
        </div>
        <span style={CARD_TITLE}>Order anniversary gift</span>
      </div>

      <div>
        {SHOPPING_AGENTS.map((agent, i) => (
          <motion.div
            key={agent.task}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: (i * 800) / 1000 }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}
          >
            <Bot size={13} color={ACCENT} />
            <span style={{ fontFamily: BODY, fontSize: 10.5, color: INK, flex: 1 }}>
              Agent {i + 1} — {agent.task}
            </span>
            {done.includes(i) && <Check size={12} color={ACCENT} />}
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` }}
          >
            <CheckCircle2 size={13} color={ACCENT} />
            <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: INK }}>
              Order placed — arriving Thursday
            </span>
          </motion.div>
        )}
      </AnimatePresence>
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

// the opening beat, played once on mount: the same alpha-keyed crane, but a
// true reverse-encoded render of the fold clip (not a scrubbed
// playbackRate hack), so the crane unfolds down into a flat sheet just as
// seamlessly — transparent background throughout — before the build loop
// below takes over.
function StageUnfold({ onDone }) {
  return (
    <video
      src={craneUnfoldVideo}
      autoPlay
      muted
      playsInline
      onEnded={onDone}
      style={{ width: 400, height: 400, objectFit: "cover", display: "block", background: "transparent" }}
    />
  );
}

// the video's fade-out and the next stage's fade-in must share this exact
// duration and start on the same tick — that's what makes the handoff read
// as one crossfade instead of two sequential fades
const CROSS_MS = 200;
const CROSS_TRANSITION = { duration: CROSS_MS / 1000, ease: "easeOut" };

export default function WorkflowBuildDemo({ activeStage }) {
  // controlled mode: when a numeric activeStage is passed (e.g. driven by
  // scroll in WhatSection), the internal timer is disabled entirely — and so
  // is the opening unfold, which only makes sense on a fresh mount
  const controlled = typeof activeStage === "number";
  const [internalIndex, setInternalIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // 'unfold' -> 'cross' -> 'loop'. 'cross' is a brief overlap window where
  // the unfold video and the first loop stage are both mounted at once,
  // fading into each other simultaneously — a real cross-dissolve, not a
  // sequential disappear-then-reappear.
  const [phase, setPhase] = useState(controlled ? "loop" : "unfold");

  useEffect(() => {
    if (phase !== "cross") return;
    const t = setTimeout(() => setPhase("loop"), CROSS_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (controlled || paused || phase !== "loop") return;
    const t = setTimeout(() => setInternalIndex((i) => (i + 1) % STAGES.length), STAGES[internalIndex].duration);
    return () => clearTimeout(t);
  }, [internalIndex, paused, controlled, phase]);

  const stageIndex = controlled
    ? Math.max(0, Math.min(STAGES.length - 1, activeStage))
    : internalIndex;

  // transparent while the unfold video is playing (so it blends into the
  // page, not a blue box), then the panel appears the instant the crane has
  // fully unfolded — i.e. the moment "cross" begins — timed to land exactly
  // together with the content crossfade below, not before or after it.
  // Also goes transparent for the regular fold stage later in the loop.
  const isTransparent = phase === "unfold" || (phase === "loop" && STAGES[stageIndex].key === "fold");

  const renderStage = () => {
    switch (STAGES[stageIndex].key) {
      case "inbox": return <StageEmailRead />;
      case "digest": return <StageDigest />;
      case "conflict": return <StageConflict />;
      case "draft": return <StageDraftReply />;
      case "shopping": return <StageShoppingAgents />;
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
        initial={false}
        animate={{
          backgroundColor: isTransparent ? "rgba(197,243,255,0)" : PANEL_BG,
          boxShadow: isTransparent
            ? "0 2px 5px -1px rgba(27,27,24,0), 0 34px 60px -26px rgba(27,27,24,0)"
            : "0 2px 5px -1px rgba(27,27,24,0.16), 0 34px 60px -26px rgba(27,27,24,0.30)",
        }}
        transition={CROSS_TRANSITION}
        style={{
          position: "relative", width: 400, height: 400, background: "transparent",
          borderRadius: 0, display: "flex", alignItems: "center",
          justifyContent: "center", overflow: "hidden",
        }}
      >
        {(phase === "unfold" || phase === "cross") && (
          <motion.div
            initial={false}
            animate={{ opacity: phase === "cross" ? 0 : 1 }}
            transition={CROSS_TRANSITION}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}
          >
            <StageUnfold onDone={() => setPhase("cross")} />
          </motion.div>
        )}

        {/* mounts once, at the same instant the video starts fading out —
            same CROSS_TRANSITION, same start tick — so the two blend into
            one continuous motion instead of two sequential fades. It then
            stays mounted (never remounted) through "loop", so the stage
            inside it never resets mid-reveal; initial={false} on its
            AnimatePresence means stage-to-stage swaps later crossfade
            without an extra fade-in of their own. */}
        {(phase === "cross" || phase === "loop") && (
          <motion.div
            initial={{ opacity: phase === "cross" ? 0 : 1 }}
            animate={{ opacity: 1 }}
            transition={CROSS_TRANSITION}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={stageIndex} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                {renderStage()}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
