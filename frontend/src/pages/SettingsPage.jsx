import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import { AVAILABLE_SCOPES, getCurrentUser, updateProfile } from "../auth/realAuth";
import { BODY, MONO, SERIF, FONT_IMPORT, INK, INK_SOFT, ACCENT, LINE, PAPER_WARM, GRAIN } from "../theme";

const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

const inputStyle = {
  fontFamily: BODY, fontSize: 14, color: INK, background: "#FFFFFF",
  border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", width: "100%",
  outline: "none", boxSizing: "border-box",
};

const cardStyle = {
  background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16,
  padding: "22px 24px", marginBottom: 20,
};

const sectionTitle = { fontFamily: SERIF, fontWeight: 400, fontSize: 18, color: INK, margin: "0 0 16px" };

export default function SettingsPage() {
  const [user, setUser] = useState(getCurrentUser());
  const [name, setName] = useState(user.name);
  const [dob, setDob] = useState(user.dob);
  const [savedNote, setSavedNote] = useState("");

  const saveProfile = async (e) => {
    e.preventDefault();
    setUser(await updateProfile(user.id, { name, dob }));
    setSavedNote("Profile saved.");
    setTimeout(() => setSavedNote(""), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER_WARM, backgroundImage: GRAIN, display: "flex" }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "64px 24px 24px" }}>
        <div style={{ width: "100%", maxWidth: 620 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_SOFT, marginBottom: 8 }}>
            SETTINGS
          </div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, color: INK, margin: "0 0 28px" }}>
            {user.name}
          </h1>

          <div style={cardStyle}>
            <h2 style={sectionTitle}>Profile</h2>
            <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}>Name</span>
                <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}>Date of birth</span>
                <input type="date" style={inputStyle} value={dob} onChange={(e) => setDob(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}>Google account</span>
                <div style={{ fontFamily: MONO, fontSize: 12.5, color: INK_SOFT }}>{user.email}</div>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="submit"
                  style={{ fontFamily: BODY, fontWeight: 600, fontSize: 13, color: "#FBF9F4", background: ACCENT, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}
                >
                  Save
                </button>
                {savedNote && <span style={{ fontFamily: BODY, fontSize: 12, color: INK_SOFT }}>{savedNote}</span>}
              </div>
            </form>
          </div>

          <div style={{ ...cardStyle, marginBottom: 0 }}>
            <h2 style={sectionTitle}>Connected scopes</h2>
            <p style={{ fontFamily: BODY, fontSize: 12, color: INK_SOFT, margin: "-8px 0 16px", lineHeight: 1.5 }}>
              What Google actually granted when you connected your account. This
              app can't change that on its own — Google requires you to grant or
              revoke access from your own Google Account, not from a checkbox
              here.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {AVAILABLE_SCOPES.map((scope) => {
                const granted = user.scopes.includes(scope.id);
                return (
                  <div key={scope.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 10 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                        background: granted ? ACCENT : LINE,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: INK }}>{scope.label}</div>
                      <div style={{ fontFamily: BODY, fontSize: 11.5, color: INK_SOFT }}>{scope.detail}</div>
                    </div>
                    <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: granted ? ACCENT : INK_SOFT }}>
                      {granted ? "Granted" : "Not granted"}
                    </span>
                  </div>
                );
              })}
            </div>
            <a
              href={GOOGLE_PERMISSIONS_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block", fontFamily: BODY, fontWeight: 600, fontSize: 13, color: "#FBF9F4",
                background: ACCENT, borderRadius: 8, padding: "9px 16px", textDecoration: "none",
              }}
            >
              Manage access in your Google Account →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
