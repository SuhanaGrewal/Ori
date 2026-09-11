import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import { formatRelativeTime } from "../lib/relativeTime";
import { BODY, MONO, INK, INK_SOFT, ACCENT, ACCENT_SOFT, LINE, PAPER_WARM } from "../theme";

// "Recent queries" as a small tab peeking from the left edge - like a
// label sticking out of a file folder - rather than an always-visible
// history list cluttering the screen. History stays out of sight until
// this one deliberate click pulls a past card back into focus.
//
// Deliberately stays OPEN after picking a card (unlike the first cut of
// this component, which auto-closed on every selection) - real feedback
// was that jumping between a few different past chats felt clunky when
// the panel closed itself each time; leaving it open lets that happen
// in one continuous flow instead of a re-open per click.
export default function RecentQueriesRail({ cards, activeCardId, onSelectCard, onNewChat, searchText, onSearchChange, leftOffset = 0 }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        position: "fixed", top: 90, left: leftOffset, zIndex: 50,
        transition: "left 0.22s ease-out",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Recent queries"
        style={{
          position: "relative", zIndex: 51, display: "flex", alignItems: "center", gap: 7,
          fontFamily: BODY, fontWeight: 600, fontSize: 13, color: open ? INK : INK_SOFT,
          background: open ? ACCENT_SOFT : PAPER_WARM, border: `1px solid ${LINE}`, borderLeft: "none",
          borderRadius: "0 999px 999px 0", padding: "10px 16px 10px 12px", cursor: "pointer",
          boxShadow: "6px 0 16px -10px rgba(27,27,24,0.18)",
        }}
      >
        <Clock size={13} color={open ? ACCENT : INK_SOFT} strokeWidth={2} />
        Recent
      </button>

      {/* dims + click-catches the rest of the page while open, instead of
          the panel just floating on top of whatever card is behind it -
          also opens straight DOWN from the button now, not sideways over
          the main chat column. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(27,27,24,0.15)", zIndex: 49 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 51,
              width: 270, maxHeight: "min(70vh, 520px)", overflowY: "auto", background: PAPER_WARM,
              border: `1px solid ${LINE}`, borderRadius: 14,
              boxShadow: "0 20px 40px -14px rgba(27,27,24,0.28)", padding: "16px 14px",
            }}
          >
            <button
              onClick={onNewChat}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                fontFamily: BODY, fontWeight: 600, fontSize: 13, color: ACCENT,
                background: "none", border: "none", borderRadius: 8, padding: "8px 10px", marginBottom: 8,
              }}
            >
              + New chat
            </button>

            <input
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search history…"
              style={{
                width: "100%", fontFamily: BODY, fontSize: 12.5, color: INK, background: "#FFFFFF",
                border: `1px solid ${LINE}`, borderRadius: 10, padding: "7px 10px", outline: "none",
                marginBottom: 12, boxSizing: "border-box",
              }}
            />

            {cards.length === 0 && (
              <div style={{ fontFamily: BODY, fontSize: 12, color: INK_SOFT, padding: "6px 4px" }}>Nothing yet.</div>
            )}

            {cards.map((card) => {
              const isActive = card.id === activeCardId;
              return (
                <button
                  key={card.id}
                  onClick={() => onSelectCard(card.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                    background: isActive ? ACCENT_SOFT : "transparent", border: "none", borderRadius: 8,
                    padding: "8px 10px", marginBottom: 2,
                  }}
                >
                  {card.clusterTitle && (
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: ACCENT, marginBottom: 2 }}>{card.clusterTitle}</div>
                  )}
                  <div style={{ fontFamily: BODY, fontSize: 12.5, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {card.title || card.question}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: INK_SOFT }}>{formatRelativeTime(card.updatedAt)}</div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
