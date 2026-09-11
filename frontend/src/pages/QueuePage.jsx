import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import { getCurrentUser } from "../auth/realAuth";
import { BODY, MONO, SERIF, FONT_IMPORT, INK, INK_SOFT, ACCENT, LINE, PAPER_WARM, GRAIN } from "../theme";

// TEMPORARY placeholder content, explicitly requested for a demo - not
// real data, no backend endpoint behind this yet. Delete this array (and
// swap the render back to the plain empty state below) when told to
// clear it out.
const FAKE_QUEUE_ITEMS = [
  {
    id: "fake-1",
    kind: "Drafted reply",
    title: "Re: Budget review — final numbers",
    to: "jordan@acme.com",
    body: "Thanks for sending this over — the Q3 numbers look right to me. Happy to sign off, just flag if the vendor line moves before Friday.",
  },
  {
    id: "fake-2",
    kind: "Proposed automation",
    title: "Move Thursday's 1:1 with Priya",
    body: "You have a conflict Thursday 2–2:30pm (Priya sync overlaps the board prep block). Proposing to move it to Friday 10am, where you're both free — nothing will be moved until you approve.",
  },
  {
    id: "fake-3",
    kind: "Drafted reply",
    title: "Re: Contract renewal — quick question",
    to: "hello@notify.railway.app",
    body: "Got it, thanks for the heads up on the usage-based pricing change. We'll review before the renewal date and get back to you if anything needs adjusting.",
  },
];

function QueueCard({ item, onApprove, onDismiss }) {
  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: "20px 22px", marginBottom: 14, textAlign: "left" }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: ACCENT, textTransform: "uppercase", marginBottom: 6 }}>
        {item.kind}
      </div>
      <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 14.5, color: INK, marginBottom: 4 }}>
        {item.title}
      </div>
      {item.to && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: INK_SOFT, marginBottom: 10 }}>To: {item.to}</div>
      )}
      <div style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, lineHeight: 1.55, marginBottom: 16 }}>
        {item.body}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onApprove(item.id)}
          style={{ fontFamily: BODY, fontWeight: 600, fontSize: 12.5, color: "#FBF9F4", background: ACCENT, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}
        >
          Approve
        </button>
        <button
          onClick={() => onDismiss(item.id)}
          style={{ fontFamily: BODY, fontWeight: 600, fontSize: 12.5, color: INK_SOFT, background: "none", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Ori is human-gated by design — drafted replies, proposed automations,
// anything Ori wants to do lands here for approval before it happens.
// No backend endpoint for this yet, so the real empty state below is
// honest rather than fabricated - FAKE_QUEUE_ITEMS above is a deliberate,
// temporary exception for a demo.
export default function QueuePage() {
  const user = getCurrentUser();
  const [items, setItems] = useState(FAKE_QUEUE_ITEMS);

  const remove = (id) => setItems((prev) => prev.filter((item) => item.id !== id));

  return (
    <div style={{ minHeight: "100vh", background: PAPER_WARM, backgroundImage: GRAIN, display: "flex" }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "64px 24px 24px" }}>
        <div style={{ width: "100%", maxWidth: 620 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_SOFT, marginBottom: 8 }}>
            QUEUE
          </div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, color: INK, margin: "0 0 28px" }}>
            Waiting on your approval
          </h1>

          {items.length > 0 ? (
            items.map((item) => <QueueCard key={item.id} item={item} onApprove={remove} onDismiss={remove} />)
          ) : (
            <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.6 }}>
                Nothing waiting right now. Drafted replies and proposed automations will show up here before Ori acts on them.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
