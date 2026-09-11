import React, { useEffect, useMemo, useState } from "react";
import Sidebar, { SIDEBAR_DRAWER_WIDTH } from "../components/Sidebar";
import CraneDigestButton from "../components/CraneDigestButton";
import RecentQueriesRail from "../components/RecentQueriesRail";
import AskSearchBar from "../components/AskSearchBar";
import AskCard from "../components/AskCard";
import SyncStatusIndicator from "../components/SyncStatusIndicator";
import { getCurrentUser, hydrateSession } from "../auth/realAuth";
import { getAnswer } from "../api/realApi";
import { fileNewQuestion, fileFollowUpOnCard, attachAnswer, getFocusedCard, getAllCardsFlat, searchCards } from "../lib/cardStore";
import { getGreeting } from "../lib/greeting";
import { BODY, MONO, SERIF, FONT_IMPORT, INK, INK_SOFT, LINE, PAPER_WARM, GRAIN } from "../theme";

// one-click starting points on the fresh landing view, in place of a
// static "try asking..." hint - real questions the ask bar already
// answers, not decorative. "What's on my calendar tomorrow" (not "clear
// up my calendar tomorrow") deliberately - the router has no actual
// "review my calendar and propose what to cancel" capability yet, only
// fact lookups (GENERAL) and conflict detection (CALENDAR_CONFLICTS); an
// imperative "clear up..." phrasing gets misread as REMINDER intake
// instead, which proposes an unrelated free slot and makes no sense as
// a reply. This button should ask something the backend actually
// supports well, not the aspirational phrasing.
const QUICK_ACTIONS = ["What's due this week", "What's on my calendar tomorrow", "Draft an email"];

// "Draft an email" is deliberately not sent to the backend at all - a
// bare instruction with no email/thread named gives the draft-reply
// pipeline (which drafts a reply to one specific existing thread) nothing
// to work with, so asking the obvious clarifying question locally is more
// honest than shipping a request that can't be satisfied.
const DRAFT_EMAIL_CLARIFYING_ANSWER =
  "What would you like me to draft — a reply to an existing email, or a fresh one? " +
  "If it's a reply, tell me who/which thread and I'll pull it up.";

// A CEO doesn't want a growing chat log, and doesn't want yesterday's
// questions cluttering the screen the moment they open the app either -
// every open starts at a fresh, empty landing view (a time-of-day
// greeting + the persistent ask bar), never resuming whatever was last
// on screen. History exists, is fully searchable, and never expires
// (see cardStore.js) - it's just never in the way until deliberately
// pulled back into focus via RecentQueriesRail (the "labels poking out
// of a file" affordance) or by asking a fresh question.
//
// `focusedCardId` is the whole state machine here: null = the landing
// view; set = exactly one card shown, front and center. There is
// deliberately no "feed of many cards" view at all anymore - a genuinely
// related follow-up nests inside the focused card's own thread (either
// auto-detected by cardStore's heuristic, or explicitly started via
// AskCard's "+ Follow up on this"); an unrelated question replaces focus
// with a brand-new card instead of adding to a list.
export default function DashboardPage() {
  const [user, setUser] = useState(() => getCurrentUser());
  const [question, setQuestion] = useState("");
  const [pendingAsk, setPendingAsk] = useState(null);
  const [focusedCardId, setFocusedCardId] = useState(null);
  const [focusedCard, setFocusedCard] = useState(null);
  const [railSearchText, setRailSearchText] = useState("");
  const [greeting] = useState(() => getGreeting());
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (user.syncStatus !== "syncing") return;
    const interval = setInterval(async () => {
      const refreshed = await hydrateSession();
      if (!refreshed) return;
      setUser(refreshed);
    }, 4000);
    return () => clearInterval(interval);
  }, [user.syncStatus]);

  const refreshFocusedCard = (cardId) => {
    setFocusedCard(cardId ? getFocusedCard(user.id, cardId) : null);
  };

  // A network/backend failure here used to be an unhandled promise
  // rejection - getAnswer()'s fetch has no try/catch of its own, so if
  // the backend is unreachable (confirmed live: it had just been killed
  // by the OS for low memory) the whole page crashed to CRA's "Uncaught
  // Runtime Errors" overlay instead of just showing this one answer as
  // failed. Catching it here resolves the pending card with a plain
  // error message instead - the rest of the app, and every other card,
  // stays completely unaffected.
  const askAndAttach = async (filed, questionText) => {
    setPendingAsk(filed);
    if (questionText === "Draft an email") {
      attachAnswer(user.id, filed, { answer: DRAFT_EMAIL_CLARIFYING_ANSWER, citations: [] });
      setPendingAsk(null);
      return;
    }
    try {
      // a title is only generated for a brand-new top-level card
      // (filed.followUpId === null) - fileNewQuestion() itself may still
      // decide to nest this under an existing card via its own
      // recency/entity heuristic even when called from the top search
      // bar, so this checks the actual filing result, not which control
      // triggered it.
      const payload = await getAnswer(questionText, filed.threadId, { generateTitle: filed.followUpId === null });
      attachAnswer(user.id, filed, payload);
    } catch {
      attachAnswer(user.id, filed, {
        answer: "Couldn't reach Ori just now - the connection dropped. Try asking again.",
        citations: [],
      });
    }
    setPendingAsk(null);
  };

  // shared by the search bar's own submit and the landing view's quick-
  // action buttons (see QUICK_ACTIONS below) - both just need "file and
  // answer this exact text," neither should have to fake a form event.
  const submitQuestion = async (q) => {
    if (!q || pendingAsk) return;
    setQuestion("");
    setRailSearchText("");

    // cardStore decides the cluster/nesting synchronously and writes a
    // pending placeholder immediately, before the backend has answered
    // - focusing it right away shows that placeholder optimistically.
    const filed = fileNewQuestion(user.id, q);
    setFocusedCardId(filed.cardId);
    refreshFocusedCard(filed.cardId);

    await askAndAttach(filed, q);
    refreshFocusedCard(filed.cardId);
  };

  const handleAsk = (e) => {
    e.preventDefault();
    submitQuestion(question.trim());
  };

  // the explicit "+ Follow up on this" control on the focused card -
  // unlike handleAsk, this always nests under the exact card shown, no
  // clustering/heuristic decision involved.
  const handleFollowUp = async (text) => {
    if (!focusedCardId || pendingAsk) return;
    const filed = fileFollowUpOnCard(user.id, focusedCardId, text);
    if (!filed) return;
    refreshFocusedCard(focusedCardId);

    await askAndAttach(filed, text);
    refreshFocusedCard(focusedCardId);
  };

  const handleSelectFromRail = (cardId) => {
    setFocusedCardId(cardId);
    refreshFocusedCard(cardId);
  };

  // the deliberate "exit this card back to a fresh chat" control - a
  // focused card previously had no way back to the empty landing view
  // short of a full page reload.
  const handleBackToFresh = () => {
    setFocusedCardId(null);
    setFocusedCard(null);
  };

  const railCards = useMemo(() => {
    return railSearchText.trim() ? searchCards(user.id, railSearchText) : getAllCardsFlat(user.id);
    // pendingAsk/focusedCard changes are exactly when the archive itself
    // has just changed (a new card/follow-up filed or answered) - re-run
    // the lookup so the rail reflects it without needing its own poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railSearchText, user.id, pendingAsk, focusedCard]);

  return (
    <div style={{ height: "100vh", background: PAPER_WARM, backgroundImage: GRAIN, display: "flex", overflow: "hidden" }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar user={user} onOpenChange={setNavOpen} />

      <div style={{ position: "fixed", top: 20, right: 28, zIndex: 60 }}>
        <CraneDigestButton userId={user.id} />
      </div>

      <RecentQueriesRail
        cards={railCards}
        activeCardId={focusedCardId}
        onSelectCard={handleSelectFromRail}
        onNewChat={handleBackToFresh}
        searchText={railSearchText}
        onSearchChange={setRailSearchText}
        leftOffset={navOpen ? SIDEBAR_DRAWER_WIDTH : 0}
      />

      {/* the whole "ask" surface shifts right, rather than the nav
          drawer overlaying it - previously the drawer (and, before
          the rail moved to the left edge, the rail's own tab) sat on
          top of each other at the same screen edge with nothing to
          keep them apart. */}
      <div style={{ flex: 1, display: "flex", marginLeft: navOpen ? SIDEBAR_DRAWER_WIDTH : 0, transition: "margin-left 0.22s ease-out", minWidth: 0 }}>
      {focusedCard ? (
        <div style={{ flex: 1, display: "flex", justifyContent: "center", overflow: "hidden", padding: "64px 24px 24px" }}>
          <div style={{ width: "100%", maxWidth: 720, height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ flexShrink: 0, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_SOFT }}>
                  ASK ORI
                </div>
                <button
                  onClick={handleBackToFresh}
                  style={{ fontFamily: BODY, fontSize: 12, color: INK_SOFT, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  ← New chat
                </button>
              </div>
              <AskSearchBar
                value={question}
                onChange={setQuestion}
                onSubmit={handleAsk}
                disabled={!!pendingAsk}
                placeholder="Ask Ori a separate question…"
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
              <AskCard
                card={focusedCard}
                clusterTitle={focusedCard.clusterTitle}
                onAskFollowUp={handleFollowUp}
                followUpPending={!!pendingAsk}
              />
            </div>
          </div>
        </div>
      ) : (
        // the fresh landing view - shown on every open, never restored
        // from a prior session. Centered, Claude-style: greeting first,
        // the ask bar directly beneath it.
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 600, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_SOFT, marginBottom: 14 }}>
              ASK ORI
            </div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 28, color: INK, margin: "0 0 24px" }}>
              {greeting}
            </h1>
            <AskSearchBar value={question} onChange={setQuestion} onSubmit={handleAsk} disabled={!!pendingAsk} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
              {QUICK_ACTIONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => submitQuestion(label)}
                  disabled={!!pendingAsk}
                  style={{
                    fontFamily: BODY, fontSize: 12.5, color: INK_SOFT, background: "#FFFFFF",
                    border: `1px solid ${LINE}`, borderRadius: 999, padding: "7px 14px",
                    cursor: pendingAsk ? "default" : "pointer", opacity: pendingAsk ? 0.6 : 1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>

      <SyncStatusIndicator status={user.syncStatus} />
    </div>
  );
}
