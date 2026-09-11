import React from "react";
import Sidebar from "../components/Sidebar";
import { getCurrentUser } from "../auth/realAuth";
import { BODY, MONO, SERIF, FONT_IMPORT, INK, INK_SOFT, ACCENT, ACCENT_SOFT, LINE, PAPER_WARM, GRAIN } from "../theme";

const cardStyle = {
  background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16,
  padding: "22px 24px",
};

function AuditIcon({ type }) {
  const label = { account_created: "＋", oauth_grant: "⇄", scope_change: "◇", profile_update: "✎" }[type] || "•";
  return (
    <span style={{ width: 22, height: 22, borderRadius: 6, background: ACCENT_SOFT, color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
      {label}
    </span>
  );
}

export default function AuditLogPage() {
  const user = getCurrentUser();

  return (
    <div style={{ minHeight: "100vh", background: PAPER_WARM, backgroundImage: GRAIN, display: "flex" }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "64px 24px 24px" }}>
        <div style={{ width: "100%", maxWidth: 620 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_SOFT, marginBottom: 8 }}>
            AUDIT LOG
          </div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, color: INK, margin: "0 0 28px" }}>
            Account activity
          </h1>

          <div style={cardStyle}>
            {user.auditLog.length === 0 ? (
              <div style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT }}>Nothing logged yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {user.auditLog.map((entry) => (
                  <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <AuditIcon type={entry.type} />
                    <div>
                      <div style={{ fontFamily: BODY, fontSize: 12.5, color: INK }}>{entry.detail}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10.5, color: INK_SOFT }}>{new Date(entry.at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
