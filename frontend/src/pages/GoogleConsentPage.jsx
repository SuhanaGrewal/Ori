import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import craneLogo from "../assets/crane-logo-slate.svg";
import { AVAILABLE_SCOPES, completeGoogleConsent, getPendingRegistration } from "../auth/mockAuth";
import { BODY, MONO, SERIF, FONT_IMPORT, INK, INK_SOFT, ACCENT, ACCENT_SOFT, LINE, PAPER_WARM, GRAIN } from "../theme";

// stand-in for the real Google OAuth consent screen — the actual redirect +
// token exchange happens server-side, so this page just mocks the shape of
// that flow (an email + a scope list to grant) in Ori's own visual language
export default function GoogleConsentPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(undefined);
  const [email, setEmail] = useState("");
  const [granted, setGranted] = useState(AVAILABLE_SCOPES.map((s) => s.id));

  useEffect(() => {
    const user = getPendingRegistration();
    setPending(user);
    if (user) setEmail(`${user.name.toLowerCase().replace(/\s+/g, ".")}@gmail.com`);
  }, []);

  useEffect(() => {
    if (pending === null) navigate("/login", { replace: true });
  }, [pending, navigate]);

  if (!pending) return null;

  const toggleScope = (id) => {
    setGranted((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleAllow = () => {
    completeGoogleConsent(pending.id, { email, grantedScopes: granted });
    navigate("/dashboard");
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER_WARM, backgroundImage: GRAIN, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div
          style={{
            background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 18,
            padding: "32px 28px", boxShadow: "0 20px 44px -20px rgba(27,27,24,0.22)",
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_SOFT, marginBottom: 8 }}>
            STEP 2 OF 2 · MOCKED — REAL OAUTH WIRES IN HERE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <img src={craneLogo} alt="" style={{ width: 22, height: 22 }} />
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 22, color: INK, margin: 0 }}>
              Connect your Google account
            </h1>
          </div>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, margin: "0 0 20px", lineHeight: 1.5 }}>
            Hi {pending.name}. Ori uses read-only access — nothing is ever sent or edited without your approval.
          </p>

          <div style={{ marginBottom: 18, padding: "10px 12px", background: ACCENT_SOFT, borderRadius: 10, fontFamily: MONO, fontSize: 11.5, color: INK }}>
            {email}
          </div>

          <div style={{ fontFamily: BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.03em", color: INK_SOFT, textTransform: "uppercase", marginBottom: 10 }}>
            Ori is requesting access to
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {AVAILABLE_SCOPES.map((scope) => (
              <label
                key={scope.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  border: `1px solid ${LINE}`, borderRadius: 10, cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={granted.includes(scope.id)}
                  onChange={() => toggleScope(scope.id)}
                  style={{ accentColor: ACCENT, width: 15, height: 15 }}
                />
                <div>
                  <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: INK }}>{scope.label}</div>
                  <div style={{ fontFamily: BODY, fontSize: 11.5, color: INK_SOFT }}>{scope.detail}</div>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={handleAllow}
            style={{
              fontFamily: BODY, fontWeight: 600, fontSize: 14.5, color: "#FBF9F4",
              background: ACCENT, border: "none", borderRadius: 10, padding: "12px 18px",
              cursor: "pointer", width: "100%",
            }}
          >
            Allow access
          </button>
        </div>
      </div>
    </div>
  );
}
