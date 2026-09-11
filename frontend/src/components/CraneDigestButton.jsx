import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import craneLogo from "../assets/crane-logo-slate.svg";
import { getNightlyDigest, hasUnseenDigest, markDigestSeen } from "../api/realApi";
import { BODY, SERIF, INK, INK_SOFT, ACCENT, ACCENT_SOFT, LINE } from "../theme";

function pad(n) {
  return String(n).padStart(2, "0");
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in the viewer's
// own local time, no timezone suffix - matches what the picker's value
// visually represents to the person typing it in.
function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// a "morning digest" default: since yesterday 6pm through right now -
// if it's already past 6pm today, that's today's 6pm instead (covers
// "just the evening" rather than reaching back a full extra day).
function defaultWindow() {
  const until = new Date();
  const since = new Date(until);
  if (until.getHours() < 18) since.setDate(since.getDate() - 1);
  since.setHours(18, 0, 0, 0);
  return { since: toLocalInputValue(since), until: toLocalInputValue(until) };
}

function formatWindowLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

const inputStyle = {
  width: "100%", fontFamily: BODY, fontSize: 11.5, color: INK, background: "#FFFFFF",
  border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 8px", outline: "none",
  boxSizing: "border-box", marginTop: 3,
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: INK_SOFT, textTransform: "uppercase", marginBottom: 7 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function BulletList({ items, empty }) {
  if (!items || items.length === 0) {
    return <div style={{ fontFamily: BODY, fontSize: 12, color: INK_SOFT }}>{empty}</div>;
  }
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0", fontFamily: BODY, fontSize: 12, color: INK, lineHeight: 1.5 }}>
          <span style={{ color: ACCENT, flexShrink: 0 }}>·</span>
          {item}
        </div>
      ))}
    </div>
  );
}

function EventList({ items, empty }) {
  if (!items || items.length === 0) {
    return <div style={{ fontFamily: BODY, fontSize: 12, color: INK_SOFT }}>{empty}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            fontFamily: BODY, fontSize: 11.5, color: INK, lineHeight: 1.4,
            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

// backend now writes this as one or two flowing, conversational
// sentences (see digest_summary.py's _summarize_trailing) - a real
// personal-assistant voice with the actual specifics folded in, not a
// raw list of sender/email/quiet-days fields to lay out and style.
function TrailingBlurb({ text, empty }) {
  const content = (text || "").trim();
  if (!content) {
    return <div style={{ fontFamily: BODY, fontSize: 12, color: INK_SOFT }}>{empty}</div>;
  }
  return (
    <div style={{ fontFamily: BODY, fontSize: 12.5, color: INK, lineHeight: 1.6 }}>{content}</div>
  );
}

// the crane in the dashboard's top bar: carries a "+1" badge whenever
// there's an unread morning digest, and clicking it peels out a
// sticky-note panel with the digest itself - same card language as the
// hero demo's digest stage. windowStart/windowEnd + the picker below are
// user-controlled (see backend's build_morning_digest) rather than a
// fixed lookback - "all items from a time you pick," not just "today."
export default function CraneDigestButton({ userId }) {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [digest, setDigest] = useState(null);
  const [range, setRange] = useState(defaultWindow);
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    setUnseen(hasUnseenDigest(userId));
  }, [userId]);

  const loadDigest = (customRange) => {
    setDigest(null);
    getNightlyDigest(customRange || range).then(setDigest);
  };

  useEffect(() => {
    if (!open) return;
    loadDigest();
    markDigestSeen(userId);
    setUnseen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const applyRange = (e) => {
    e.preventDefault();
    loadDigest(range);
    setPickerOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Morning digest"
        style={{
          position: "relative", border: "none", background: "transparent", cursor: "pointer",
          padding: 6, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <motion.img
          src={craneLogo}
          alt=""
          animate={unseen ? { rotate: [0, -4, 3, 0] } : {}}
          transition={{ duration: 1.4, repeat: unseen ? Infinity : 0, repeatDelay: 2.4 }}
          style={{ width: 46, height: 46, transformOrigin: "50% 90%" }}
        />
        {unseen && (
          <span
            style={{
              position: "absolute", top: -2, right: -4, minWidth: 19, height: 19, padding: "0 5px",
              borderRadius: 999, background: ACCENT, color: "#FBF9F4",
              fontFamily: BODY, fontSize: 10.5, fontWeight: 700, lineHeight: "19px", textAlign: "center",
              boxShadow: "0 2px 5px rgba(27,27,24,0.25)",
            }}
          >
            +1
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              position: "absolute", top: "calc(100% + 10px)", right: 0, width: 360, maxHeight: "min(72vh, 580px)",
              overflowY: "auto", zIndex: 200, background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16,
              padding: "18px 20px", boxShadow: "0 20px 40px -12px rgba(27,27,24,0.28)",
            }}
          >
            <div style={{ marginBottom: 3 }}>
              <span style={{ fontFamily: SERIF, fontSize: 18, color: INK }}>Good morning</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
              <span style={{ fontFamily: BODY, fontSize: 11, color: INK_SOFT }}>
                {digest && digest.windowStart
                  ? `Showing since ${formatWindowLabel(digest.windowStart)}`
                  : "Loading…"}
              </span>
              <button
                onClick={() => setPickerOpen((v) => !v)}
                style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: ACCENT, background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, whiteSpace: "nowrap" }}
              >
                {pickerOpen ? "Hide" : "Change digest range"}
              </button>
            </div>

            {pickerOpen && (
              <form onSubmit={applyRange} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, padding: 12, background: ACCENT_SOFT, borderRadius: 10 }}>
                <label style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 600, color: INK }}>
                  From
                  <input
                    type="datetime-local"
                    value={range.since}
                    onChange={(e) => setRange((r) => ({ ...r, since: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <label style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 600, color: INK }}>
                  To
                  <input
                    type="datetime-local"
                    value={range.until}
                    onChange={(e) => setRange((r) => ({ ...r, until: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <button
                  type="submit"
                  style={{
                    fontFamily: BODY, fontWeight: 600, fontSize: 12, color: "#FBF9F4",
                    background: ACCENT, border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                  }}
                >
                  Apply
                </button>
              </form>
            )}

            {!digest ? (
              <div style={{ fontFamily: BODY, fontSize: 11.5, color: INK_SOFT }}>Loading…</div>
            ) : (
              <>
                <Section title="New so far">
                  <BulletList items={digest.newSoFar} empty="Nothing new yet." />
                </Section>
                <Section title="Events from last night">
                  <EventList items={digest.events} empty="No emails or events in this window." />
                </Section>
                <Section title="Things to do">
                  <BulletList items={digest.thingsToDo} empty="Nothing actionable right now." />
                </Section>
                <Section title="Still waiting on you">
                  <TrailingBlurb text={digest.trailingFollowUps} empty="Nothing trailing - you're caught up." />
                </Section>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
