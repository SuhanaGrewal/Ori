// Stand-in for the real auth backend (being built separately). Every export
// here is the interface the real service will expose too — registerProfile,
// completeGoogleConsent, getCurrentUser, updateScopes, logAudit, logout —
// so swapping this module for real API calls later shouldn't touch any page.
//
// Users are stored as a map keyed by id (so the app already models multiple,
// independent accounts) with a separate "current session" pointer, mirroring
// how a real multi-user backend + session cookie would behave.

const USERS_KEY = "ori_mock_users";
const SESSION_KEY = "ori_mock_session_user_id";
const PENDING_KEY = "ori_mock_pending_registration_id";

export const AVAILABLE_SCOPES = [
  { id: "gmail.readonly", label: "Gmail", detail: "Read your messages" },
  { id: "calendar.readonly", label: "Google Calendar", detail: "Read your events" },
  { id: "docs.readonly", label: "Google Docs", detail: "Read your documents" },
];

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function getCurrentUser() {
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  return readUsers()[id] || null;
}

// step 1 of signup — name + date of birth, before the Google redirect
export function registerProfile({ name, dob }) {
  const id = makeId("user");
  const users = readUsers();
  users[id] = {
    id,
    name,
    dob,
    email: null,
    scopes: [],
    connectedAt: null,
    auditLog: [
      { id: makeId("audit"), type: "account_created", detail: `Profile created for ${name}`, at: new Date().toISOString() },
    ],
  };
  writeUsers(users);
  localStorage.setItem(PENDING_KEY, id);
  return users[id];
}

export function getPendingRegistration() {
  const id = localStorage.getItem(PENDING_KEY);
  if (!id) return null;
  return readUsers()[id] || null;
}

// step 2 — the mocked Google OAuth consent screen hands back a fake email
// and whichever scopes the user granted
export function completeGoogleConsent(userId, { email, grantedScopes }) {
  const users = readUsers();
  const user = users[userId];
  if (!user) throw new Error("No pending registration for this user");

  user.email = email;
  user.scopes = grantedScopes;
  user.connectedAt = new Date().toISOString();
  user.auditLog = [
    {
      id: makeId("audit"),
      type: "oauth_grant",
      detail: `Connected Google account (${email}) — granted ${grantedScopes.length ? grantedScopes.join(", ") : "no scopes"}`,
      at: user.connectedAt,
    },
    ...user.auditLog,
  ];
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, userId);
  localStorage.removeItem(PENDING_KEY);
  return user;
}

export function updateScopes(userId, scopes) {
  const users = readUsers();
  const user = users[userId];
  if (!user) return null;

  user.scopes = scopes;
  user.auditLog = [
    { id: makeId("audit"), type: "scope_change", detail: `Scopes updated to: ${scopes.length ? scopes.join(", ") : "none"}`, at: new Date().toISOString() },
    ...user.auditLog,
  ];
  writeUsers(users);
  return user;
}

export function updateProfile(userId, { name, dob }) {
  const users = readUsers();
  const user = users[userId];
  if (!user) return null;

  user.name = name;
  user.dob = dob;
  user.auditLog = [
    { id: makeId("audit"), type: "profile_update", detail: "Profile details updated", at: new Date().toISOString() },
    ...user.auditLog,
  ];
  writeUsers(users);
  return user;
}

export function logAudit(userId, type, detail) {
  const users = readUsers();
  const user = users[userId];
  if (!user) return;
  user.auditLog = [{ id: makeId("audit"), type, detail, at: new Date().toISOString() }, ...user.auditLog];
  writeUsers(users);
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}
