import React, { useState } from "react";
import craneLogo from "../assets/crane-logo-slate.svg";
import { startGoogleLogin } from "../auth/realAuth";
import { BODY, SERIF, FONT_IMPORT, INK, INK_SOFT, ACCENT, LINE, PAPER_WARM, GRAIN } from "../theme";

export default function LoginPage() {
  const [submitting, setSubmitting] = useState(false);

  const handleClick = () => {
    setSubmitting(true);
    // full-page redirect, not a react-router navigation - this leaves the
    // app entirely until Google redirects back to /dashboard?session=...
    // (a returning email lands back on that same account's history; see
    // startGoogleLogin's own comment). Name/DOB, if wanted, are filled in
    // afterward on the Settings page rather than blocking sign-in here.
    startGoogleLogin();
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER_WARM, backgroundImage: GRAIN, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32, justifyContent: "center" }}>
          <img src={craneLogo} alt="Ori" style={{ width: 34, height: 34 }} />
          <span style={{ fontFamily: SERIF, fontSize: 30, color: INK }}>Ori.<span style={{ fontStyle: "italic" }}>ai</span></span>
        </div>

        <div
          style={{
            background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 18,
            padding: "32px 28px", boxShadow: "0 20px 44px -20px rgba(27,27,24,0.22)",
          }}
        >
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, color: INK, margin: "0 0 6px" }}>
            Welcome to Ori
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, margin: "0 0 24px", lineHeight: 1.5 }}>
            Sign in with Google so Ori can start reading, drafting, and staying on top of things for you.
          </p>

          <button
            type="button"
            onClick={handleClick}
            disabled={submitting}
            style={{
              fontFamily: BODY, fontWeight: 600, fontSize: 14.5, color: "#FBF9F4",
              background: ACCENT, border: "none", borderRadius: 10, padding: "12px 18px",
              width: "100%", cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Redirecting…" : "Continue with Google →"}
          </button>
        </div>
      </div>
    </div>
  );
}
