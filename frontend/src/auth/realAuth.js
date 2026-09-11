// Real backend equivalent of mockAuth.js - same exported interface (per
// mockAuth.js's own header comment: "swapping this module for real API
// calls later shouldn't touch any page"), so pages that only call these
// functions don't need to change. Two things DO need one small change
// elsewhere, both noted where they happen: (1) getCurrentUser() must stay
// synchronous like the mock, but real user data is inherently fetched
// over the network - so this module keeps an in-memory cache, hydrated
// once at app boot (see hydrateSession, called from App.js) rather than
// on every read; (2) the real Google consent screen is Google's own
// hosted page, not Ori's mocked /auth/google route, so LoginPage redirects
// straight to startGoogleConsent() instead of navigating there.
//
// Session identity: the frontend (localhost:3000) and this backend
// (localhost:8420) are different origins to the browser, so a cookie set
// by the backend would never reach fetch() calls made from the frontend's
// origin without extra cross-origin cookie plumbing that isn't worth it
// for a personal, local-only tool. Instead the backend hands back an
// opaque session token via a "?session=" query param after the OAuth
// redirect completes; captureSessionFromUrl() picks it up, stores it in
// localStorage (the same mechanism the mock already uses for its own
// session key), and every authenticated request includes it.

// REACT_APP_API_BASE is baked in at build time (CRA convention - any env
// var without this prefix is silently dropped from the bundle). Set it
// on Vercel to the deployed backend's URL (e.g. the Railway app); with
// nothing set, this still defaults to localhost for local dev against
// `python -m ori.webchat`.
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8420";
const SESSION_TOKEN_KEY = "ori_session_token";
const PENDING_USER_ID_KEY = "ori_pending_user_id";

let _cachedUser = null;

export const AVAILABLE_SCOPES = [
  { id: "gmail.readonly", label: "Gmail", detail: "Read your messages" },
  { id: "calendar.readonly", label: "Google Calendar", detail: "Read your events" },
  { id: "docs.readonly", label: "Google Docs", detail: "Read your documents" },
];

export function getCurrentUser() {
  return _cachedUser;
}

// Call once at app boot, before rendering any route that might call
// getCurrentUser() - resolves the stored session token (if any) into a
// real user profile and populates the cache. Also re-called after any
// profile/scope mutation so the cache never goes stale.
export async function hydrateSession() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    _cachedUser = null;
    return null;
  }
  try {
    const response = await fetch(`${API_BASE}/api/auth/session/${token}`);
    if (!response.ok) {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      _cachedUser = null;
      return null;
    }
    _cachedUser = await response.json();
    return _cachedUser;
  } catch {
    _cachedUser = null;
    return null;
  }
}

// Captures the "?session=<token>" query param the OAuth callback's
// redirect drops on /dashboard (see webchat/server.py's google_callback).
// Call once at app boot, before hydrateSession(), then the URL is
// cleaned so a page refresh doesn't try to re-consume it.
export function captureSessionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("session");
  if (!token) return;
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  params.delete("session");
  const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
  window.history.replaceState({}, "", cleanUrl);
}

export async function registerProfile({ name, dob }) {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, dob }),
  });
  const user = await response.json();
  localStorage.setItem(PENDING_USER_ID_KEY, user.id);
  return user;
}

export async function getPendingRegistration() {
  const id = localStorage.getItem(PENDING_USER_ID_KEY);
  if (!id) return null;
  const response = await fetch(`${API_BASE}/api/auth/users/${id}`);
  if (!response.ok) return null;
  return response.json();
}

// The actual "Sign in with Google" entry point - no pre-existing user_id
// needed, unlike startGoogleConsent below. The backend looks the signed-
// in Google account up by email and either logs into the matching
// existing account or creates a new one (see server.py's
// google_login_callback), so a returning user lands back on their real
// history instead of a blank new account every time.
export function startGoogleLogin() {
  window.location.href = `${API_BASE}/api/auth/google/login`;
}

// Connects Google to an ALREADY-registered account (registerProfile()
// must have run first) - kept for the settings-page "connect Google"
// case, distinct from startGoogleLogin() above which is real sign-in.
export function startGoogleConsent(userId) {
  window.location.href = `${API_BASE}/api/auth/google/start?user_id=${encodeURIComponent(userId)}`;
}

export async function updateScopes(userId, scopes) {
  const response = await fetch(`${API_BASE}/api/auth/users/${userId}/scopes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopes }),
  });
  const user = await response.json();
  _cachedUser = user;
  return user;
}

export async function updateProfile(userId, { name, dob }) {
  const response = await fetch(`${API_BASE}/api/auth/users/${userId}/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, dob }),
  });
  const user = await response.json();
  _cachedUser = user;
  return user;
}

export function logout() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(PENDING_USER_ID_KEY);
  _cachedUser = null;
  if (token) {
    fetch(`${API_BASE}/api/auth/logout/${token}`, { method: "POST" }).catch(() => {});
  }
}
