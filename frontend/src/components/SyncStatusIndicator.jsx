import React from "react";
import { motion } from "framer-motion";
import { BODY, INK_SOFT, ACCENT, ACCENT_SOFT } from "../theme";

// three dots pulsing in sequence - a small, unmistakably "still working"
// signal, since the static text alone read as inert.
function LoadingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: 6 }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
          style={{ width: 4, height: 4, borderRadius: "50%", background: ACCENT, display: "inline-block" }}
        />
      ))}
    </span>
  );
}

// Small, non-blocking corner pill - not a full-width banner competing
// with the actual content. Mirrors CraneDigestButton's corner-widget
// convention (opposite corner, same z-layer). Renders NOTHING once
// status leaves "syncing"/"error" - no lingering "synced" confirmation
// of any kind, and entirely decoupled from whether any cards/history
// exist.
export default function SyncStatusIndicator({ status }) {
  if (status !== "syncing" && status !== "error") return null;

  const isError = status === "error";
  return (
    <div
      style={{
        position: "fixed", bottom: 20, right: 28, zIndex: 60,
        display: "flex", alignItems: "center",
        fontFamily: BODY, fontSize: 12, color: isError ? "#B4544A" : INK_SOFT,
        background: isError ? "#F7E9E7" : ACCENT_SOFT,
        borderRadius: 20, padding: "8px 14px", boxShadow: "0 6px 20px -8px rgba(27,27,24,0.25)",
        maxWidth: 280,
      }}
    >
      {isError ? "Sync error — try reconnecting from Settings." : "Syncing Gmail, Calendar, Docs"}
      {!isError && <LoadingDots />}
    </div>
  );
}
