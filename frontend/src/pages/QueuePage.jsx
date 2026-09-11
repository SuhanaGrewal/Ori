import React from "react";
import Sidebar from "../components/Sidebar";
import { getCurrentUser } from "../auth/realAuth";
import { BODY, MONO, SERIF, FONT_IMPORT, INK, INK_SOFT, LINE, PAPER_WARM, GRAIN } from "../theme";

// Ori is human-gated by design — drafted replies, proposed automations,
// anything Ori wants to do lands here for approval before it happens.
// No backend endpoint for this yet, so this is an honest empty state
// rather than fabricated pending items.
export default function QueuePage() {
  const user = getCurrentUser();

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

          <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.6 }}>
              Nothing waiting right now. Drafted replies and proposed automations will show up here before Ori acts on them.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
