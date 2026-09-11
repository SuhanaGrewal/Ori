import React from "react";
import { BODY, INK, LINE, ACCENT } from "../theme";

// The persistent, always-accessible way to ask Ori a question - like a
// Spotlight/Superhuman command bar, not buried at the bottom of a chat
// thread waiting to be scrolled to. Rendered once, pinned at the top of
// the main content column, regardless of whether any cards exist yet.
export default function AskSearchBar({ value, onChange, onSubmit, disabled, placeholder = "Ask Ori anything…" }) {
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: 10 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, fontFamily: BODY, fontSize: 15, color: INK, background: "#FFFFFF",
          border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 18px", outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={disabled}
        style={{
          fontFamily: BODY, fontWeight: 600, fontSize: 14, color: "#FBF9F4",
          background: ACCENT, border: "none", borderRadius: 12, padding: "14px 22px",
          cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
        }}
      >
        Ask
      </button>
    </form>
  );
}
