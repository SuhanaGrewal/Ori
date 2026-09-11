import React, { useState } from "react";
import CitationList from "./CitationList";
import { formatAnswerText } from "../lib/formatAnswerText";
import { formatRelativeTime } from "../lib/relativeTime";
import { BODY, MONO, SERIF, INK, INK_SOFT, ACCENT, ACCENT_SOFT, LINE } from "../theme";

// A genuinely related follow-up ("and who signed off on that?") nests
// here as a mini-thread rather than becoming its own card - visually
// distinguished with a left border + indent.
function FollowUpBlock({ followUp }) {
  return (
    <div style={{ marginTop: 16, marginLeft: 20, paddingLeft: 14, borderLeft: `2px solid ${LINE}` }}>
      <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 13.5, color: INK, marginBottom: 6 }}>
        {followUp.question}
      </div>
      {followUp.pending ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT }}>Ori is looking…</div>
      ) : (
        <>
          <div style={{ fontFamily: BODY, fontSize: 14, color: INK, lineHeight: 1.5 }}>
            {formatAnswerText(followUp.answer)}
          </div>
          <CitationList citations={followUp.citations} />
        </>
      )}
    </div>
  );
}

// Explicit, user-chosen escape hatch alongside the automatic
// recency+entity-overlap nesting heuristic - "the option to thread out
// from a card" on demand, not just when the heuristic happens to guess
// right. Always visible once there's an answer to follow up on - an
// earlier version hid this behind a "+ Follow up on this" button that
// only revealed the input on a second click; that extra step bought
// nothing once you're already looking at the answer, so this is just a
// search bar living in the card, not a toggle in front of one.
function FollowUpComposer({ onSubmit, disabled, indent }) {
  const [text, setText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || disabled) return;
    setText("");
    onSubmit(q);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginTop: 16, marginLeft: indent ? 20 : 0 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask a follow-up on this…"
        style={{
          flex: 1, fontFamily: BODY, fontSize: 13, color: INK, background: "#FBF9F4",
          border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 12px", outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={disabled}
        style={{
          fontFamily: BODY, fontWeight: 600, fontSize: 12.5, color: "#FBF9F4",
          background: ACCENT, border: "none", borderRadius: 10, padding: "8px 14px",
          cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
        }}
      >
        Ask
      </button>
    </form>
  );
}

// A self-contained saved question+answer artifact, not one turn in a
// growing conversation. `clusterTitle` renders as a small topic chip
// above the question. `onAskFollowUp`, when given, renders the
// always-visible follow-up search bar (hidden while the card's own
// top-level answer is still pending - nothing to follow up on yet).
export default function AskCard({ card, clusterTitle, onAskFollowUp, followUpPending }) {
  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 20px" }}>
      {clusterTitle && (
        <div style={{ display: "inline-block", fontFamily: MONO, fontSize: 10, color: ACCENT, background: ACCENT_SOFT, borderRadius: 20, padding: "3px 9px", marginBottom: 10 }}>
          {clusterTitle}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <div style={{ fontFamily: SERIF, fontSize: 16, color: INK, lineHeight: 1.4 }}>
          {/* a generated title (ChatGPT/Claude-style, from the backend -
              see realApi.js's getAnswer / titling.py) reads as the card's
              heading once one exists; falls back to the raw question
              while it's still pending or if titling failed/was skipped
              (no LLM configured) */}
          {card.title || card.question}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: INK_SOFT, whiteSpace: "nowrap", paddingTop: 3 }}>
          {formatRelativeTime(card.updatedAt)}
        </div>
      </div>

      {card.pending ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT }}>Ori is looking…</div>
      ) : (
        <>
          <div style={{ fontFamily: BODY, fontSize: 14, color: INK, lineHeight: 1.5 }}>
            {formatAnswerText(card.answer)}
          </div>
          <CitationList citations={card.citations} />
        </>
      )}

      {card.followUps && card.followUps.length > 0 && (
        <div>
          {card.followUps.map((followUp) => (
            <FollowUpBlock key={followUp.id} followUp={followUp} />
          ))}
        </div>
      )}

      {!card.pending && onAskFollowUp && (
        <FollowUpComposer
          disabled={followUpPending}
          indent={card.followUps.length > 0}
          onSubmit={onAskFollowUp}
        />
      )}
    </div>
  );
}
