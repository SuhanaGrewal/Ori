import React from "react";
import { Link } from "react-router-dom";
import { getCurrentUser } from "./auth/realAuth";

const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const SERIF = "'CMU Serif', 'Old Standard TT', serif";

const INK = "#1B1B18";
const INK_SOFT = "#6E6C62";
const ACCENT = "#5C8A94";
const ACCENT_SOFT = "#D9E7EA";
const LINE = "rgba(27,27,24,0.12)";

function Eyebrow({ children, fig }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.22em", color: INK_SOFT }}>
        {children}
      </span>
      {fig && (
        <>
          <div style={{ width: 40, height: 1, background: LINE }} />
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: INK_SOFT }}>{fig}</span>
        </>
      )}
    </div>
  );
}

function SectionShell({ children, maxWidth = 880 }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "96px 24px" }}>
      <div style={{ width: "100%", maxWidth }}>{children}</div>
    </div>
  );
}

// ---- 1. Product ----------------------------------------------------------

function ProductSection() {
  return (
    <SectionShell maxWidth={720}>
      <Eyebrow fig="FIG. 02">THE PRODUCT</Eyebrow>
      <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 38, color: INK, lineHeight: 1.25, margin: "0 0 20px" }}>
        Retrieval-augmented, not autocomplete.
      </h2>
      <p style={{ fontFamily: BODY, fontSize: 16.5, color: INK_SOFT, lineHeight: 1.65, margin: 0 }}>
        Ori indexes your email, calendar, and docs locally — chunked, embedded, and made
        searchable. Every answer comes from retrieving the actual source, reranking it for
        relevance, and generating a response grounded in what was really found, cited back to
        the exact email or event. Nothing relevant? It says so — it doesn't guess.
      </p>
    </SectionShell>
  );
}

// ---- 2. What it does -------------------------------------------------------

const CAPABILITIES = [
  { title: "Digests", detail: "Morning and nightly summaries of what actually changed." },
  { title: "Drafts", detail: "Writes replies for your approval. Never sends on its own." },
  { title: "Web research", detail: "Scrapes the web when your inbox alone doesn't have the answer." },
  { title: "Soft commitments", detail: "“I'll get back to you Friday” becomes a tracked follow-up, not a forgotten promise." },
  { title: "Follow-ups", detail: "Surfaces threads you never replied to, unprompted." },
  { title: "Calendar conflicts", detail: "Flags overlaps and proposes a reschedule." },
];

function CapabilityCard({ title, detail }) {
  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 14, padding: "20px 22px" }}>
      <div style={{ fontFamily: SERIF, fontSize: 18, color: INK, marginBottom: 8 }}>{title}</div>
      <div style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.55 }}>{detail}</div>
    </div>
  );
}

function WhatsDifferentSection() {
  return (
    <SectionShell maxWidth={880}>
      <Eyebrow fig="FIG. 03">WHAT IT DOES</Eyebrow>
      <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 38, color: INK, lineHeight: 1.25, margin: "0 0 32px" }}>
        Not a chatbot. A second pair of hands.
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
        {CAPABILITIES.map((c) => (
          <CapabilityCard key={c.title} {...c} />
        ))}
      </div>
    </SectionShell>
  );
}

// ---- 3. What's coming -------------------------------------------------------

const ROADMAP = [
  {
    title: "Orchestrates and spawns agents",
    detail: "Give it a multi-step task — “find and book the cheapest flight” — and it spawns sub-agents to work the pieces in parallel, then reconciles the result.",
    moat: "Most assistants can answer a question. Doing this without hallucinating a booking that never happened needs the same grounded retrieval layer Ori already has — most tools don't have one to build on.",
  },
  {
    title: "Text Ori on iMessage",
    detail: "No app to open. It lives in the thread you already have open.",
    moat: "Requires the same redaction-before-it-leaves-your-machine pipeline Ori already runs for email — most assistants were never built local-first to begin with.",
  },
  {
    title: "Smarter threading",
    detail: "Auto-clusters related questions into topics, without you managing folders.",
    moat: "Clustering by real topic overlap — not keyword guesses — needs a working retrieval index underneath it. That's also why it's rare.",
  },
];

function RoadmapRow({ title, detail, moat, index }) {
  return (
    <div style={{ display: "flex", gap: 24, padding: "28px 0", borderTop: index === 0 ? "none" : `1px solid ${LINE}` }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: ACCENT, paddingTop: 4, flexShrink: 0, width: 28 }}>
        0{index + 1}
      </div>
      <div>
        <div style={{ fontFamily: SERIF, fontSize: 20, color: INK, marginBottom: 6 }}>{title}</div>
        <div style={{ fontFamily: BODY, fontSize: 14, color: INK, lineHeight: 1.6, marginBottom: 10 }}>{detail}</div>
        <div style={{ display: "inline-block", fontFamily: BODY, fontSize: 12, color: ACCENT, background: ACCENT_SOFT, borderRadius: 8, padding: "8px 12px", lineHeight: 1.5 }}>
          Why it's rare: {moat}
        </div>
      </div>
    </div>
  );
}

function WhatsComingSection() {
  return (
    <SectionShell maxWidth={760}>
      <Eyebrow fig="FIG. 04">WHAT'S NEXT</Eyebrow>
      <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 38, color: INK, lineHeight: 1.25, margin: "0 0 8px" }}>
        Where this goes.
      </h2>
      <div>
        {ROADMAP.map((item, i) => (
          <RoadmapRow key={item.title} index={i} {...item} />
        ))}
      </div>
    </SectionShell>
  );
}

// ---- 4. Try it -------------------------------------------------------

function TryItSection() {
  return (
    <SectionShell maxWidth={600}>
      <div style={{ textAlign: "center" }}>
        <Eyebrow fig="FIG. 05">TRY IT</Eyebrow>
        <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 38, color: INK, lineHeight: 1.25, margin: "0 0 16px" }}>
          See what it finds.
        </h2>
        <p style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, lineHeight: 1.6, margin: "0 0 28px" }}>
          Connect Gmail, Calendar, and Docs, and Ori starts reading, drafting, and staying on
          top of things for you.
        </p>
        <Link
          to={getCurrentUser() ? "/dashboard" : "/login"}
          style={{
            display: "inline-block", fontFamily: BODY, fontWeight: 500, fontSize: 14.5, color: "#FBF9F4",
            background: ACCENT, padding: "12px 28px", borderRadius: 999, textDecoration: "none",
            boxShadow: "0 5px 8px -2px rgba(27,27,24,0.18), 0 16px 24px -14px rgba(27,27,24,0.30)",
          }}
        >
          Try it →
        </Link>
      </div>
    </SectionShell>
  );
}

export default function ProductPitch() {
  return (
    <div style={{ position: "relative" }}>
      <ProductSection />
      <WhatsDifferentSection />
      <WhatsComingSection />
      <TryItSection />
    </div>
  );
}
