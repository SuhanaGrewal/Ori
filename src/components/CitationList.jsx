import React, { useState } from "react";
import { BODY, INK, INK_SOFT, LINE } from "../theme";

// Sources are grounded and always available, but showing them by
// default reads cluttered - collapsed behind a small "Show source" link
// until the user actually wants them. Deliberately expand-ONLY: once
// shown, there's no control to re-hide them for that answer - a one-way
// reveal, not a toggle, since a "hide again" button for something the
// user just asked to see isn't a control anyone needs.
//
// Formatting redesigned away from the earlier mono/pill-chip look (real
// feedback: "i hate the formatting of the sources") into a plain,
// readable reference list - sender/label as the line, subject/detail
// muted underneath, divided by thin rules, no colored badges.
export default function CitationList({ citations }) {
  const [expanded, setExpanded] = useState(false);
  if (!citations || citations.length === 0) return null;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{ display: "block", fontFamily: BODY, fontSize: 11.5, color: INK_SOFT, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 12 }}
      >
        Show source{citations.length > 1 ? "s" : ""}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
      {citations.map((c, i) => (
        <div
          key={`${c.label}-${i}`}
          style={{
            display: "flex", flexDirection: "column", gap: 2, padding: "6px 0",
            borderBottom: i < citations.length - 1 ? `1px solid ${LINE}` : "none",
          }}
        >
          <span style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 600, color: INK }}>{c.label}</span>
          {c.detail && <span style={{ fontFamily: BODY, fontSize: 12, color: INK_SOFT }}>{c.detail}</span>}
        </div>
      ))}
    </div>
  );
}
