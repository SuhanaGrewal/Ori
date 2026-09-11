import React, { useState } from "react";
import craneLogo from "../assets/crane-logo-slate.svg";
import { registerProfile, startGoogleConsent } from "../auth/realAuth";
import { BODY, MONO, SERIF, FONT_IMPORT, INK, INK_SOFT, ACCENT, LINE, PAPER_WARM, GRAIN } from "../theme";

const inputStyle = {
  fontFamily: BODY, fontSize: 15, color: INK, background: "#FFFFFF",
  border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", width: "100%",
  outline: "none", boxSizing: "border-box",
};

export default function LoginPage() {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !dob) {
      setError("Enter your name and date of birth to continue.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const user = await registerProfile({ name: name.trim(), dob });
      // full-page redirect to the real Google consent screen - not a
      // react-router navigation, since this leaves the app entirely until
      // Google redirects back to /dashboard?session=... after consent.
      startGoogleConsent(user.id);
    } catch {
      setError("Couldn't reach Ori right now. Make sure the backend is running and try again.");
      setSubmitting(false);
    }
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
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_SOFT, marginBottom: 8 }}>
            STEP 1 OF 2
          </div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, color: INK, margin: "0 0 6px" }}>
            Tell us who you are
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, margin: "0 0 24px", lineHeight: 1.5 }}>
            Next you'll connect your Google account so Ori can start reading, drafting, and staying on top of things for you.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}>Name</span>
              <input
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Kim"
                autoComplete="name"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}>Date of birth</span>
              <input
                type="date"
                style={inputStyle}
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                autoComplete="bday"
              />
            </label>

            {error && (
              <div style={{ fontFamily: BODY, fontSize: 12, color: "#B4544A" }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                fontFamily: BODY, fontWeight: 600, fontSize: 14.5, color: "#FBF9F4",
                background: ACCENT, border: "none", borderRadius: 10, padding: "12px 18px",
                cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1, marginTop: 4,
              }}
            >
              {submitting ? "Continuing…" : "Continue with Google →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
