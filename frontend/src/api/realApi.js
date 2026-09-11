// Real backend equivalent of mockApi.js's actual query/digest calls. The
// thread-management functions (getThreads, getThread, createThread,
// renameThread, moveMessageGroup, fileQuestion, appendAnswer) stay
// exactly as mockApi.js already built them - that's a genuinely local,
// client-side topic-clustering UX (keyword-matched auto-filing into
// threads, all in localStorage) that doesn't need a backend at all, so
// it's re-exported unchanged rather than reimplemented here. Only the
// actual "ask the assistant a question" and "get tonight's digest" calls
// go to the real backend.

import { getCurrentUser } from "../auth/realAuth";

export {
  getThreads,
  getThread,
  createThread,
  renameThread,
  moveMessageGroup,
  fileQuestion,
  appendAnswer,
} from "./mockApi";

// see auth/realAuth.js's API_BASE comment - same build-time env var, kept
// in sync manually since CRA has no shared runtime config module here.
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8420";

const EMPTY_DIGEST = {
  date: new Date().toDateString(), windowStart: null, windowEnd: null,
  newSoFar: [], events: [], thingsToDo: [], trailingFollowUps: "",
};

// since/until (JS Date objects), when given, scope the whole digest to
// that window - the frontend's own time-range picker. Sent as plain
// isoformat strings with no "Z"/offset when the picker's own
// <input type="datetime-local"> has none; the backend treats a bare
// timestamp like that as this machine's own local time (see
// server.py's _parse_window_param), matching what the picker's value
// actually represents to the person typing it in.
export async function getNightlyDigest({ since, until } = {}) {
  const user = getCurrentUser();
  if (!user) return EMPTY_DIGEST;
  const params = new URLSearchParams({ user_id: user.id });
  if (since) params.set("since", since);
  if (until) params.set("until", until);
  const response = await fetch(`${API_BASE}/api/digest?${params.toString()}`);
  return response.json();
}

// still a purely local, per-viewer convenience - the backend has no
// concept of "seen" to track, same as the mock never needed one either.
export function hasUnseenDigest(userId) {
  const today = new Date().toDateString();
  return localStorage.getItem(`ori_digest_seen_${userId}`) !== today;
}

export function markDigestSeen(userId) {
  localStorage.setItem(`ori_digest_seen_${userId}`, new Date().toDateString());
}

// threadId is optional - when given, the backend uses that thread's
// prior turns to make sense of a bare follow-up ("what about next
// month") before ever running retrieval. Reuses the frontend's own
// topic-cluster thread id as the conversation boundary, rather than
// this project inventing a second, separate thread concept.
//
// generateTitle asks the backend for a ChatGPT/Claude-style generated
// title alongside the answer - the caller should only pass true when
// filing a brand-new top-level card, never a follow-up (see
// DashboardPage.jsx's askAndAttach), so a title is generated once per
// card, not re-derived on every turn.
export async function getAnswer(question, threadId = null, { generateTitle = false } = {}) {
  const user = getCurrentUser();
  const response = await fetch(`${API_BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: user.id, question, thread_id: threadId, generate_title: generateTitle }),
  });
  const data = await response.json();
  return { answer: data.answer, citations: data.citations, title: data.title || null };
}
