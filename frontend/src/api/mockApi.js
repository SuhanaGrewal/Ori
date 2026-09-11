// Stand-in for the real query/digest backend (being built separately). Same
// idea as mockAuth — real network calls with real latency, so pages already
// handle loading states, but the actual data is hardcoded until the backend
// is ready to swap in.

const TODAYS_DIGEST = {
  date: new Date().toDateString(),
  items: [
    "3 replies drafted, ready to send",
    "Flight check-in opens 6:00 AM tomorrow",
    "Invoice #4471 due Friday — reminder set",
  ],
};

export function getNightlyDigest() {
  return new Promise((resolve) => setTimeout(() => resolve(TODAYS_DIGEST), 250));
}

export function hasUnseenDigest(userId) {
  return localStorage.getItem(`ori_digest_seen_${userId}`) !== TODAYS_DIGEST.date;
}

export function markDigestSeen(userId) {
  localStorage.setItem(`ori_digest_seen_${userId}`, TODAYS_DIGEST.date);
}

function buildAnswer(question) {
  return {
    answer: `Here's what I found across your sources for "${question}".`,
    citations: [
      { label: "Dr. Patel's Office", detail: "Appointment reminder — Sept 3" },
      { label: "Team Sync", detail: "Calendar — Thu 2:00 PM" },
    ],
  };
}

export function getAnswer(question) {
  return new Promise((resolve) => setTimeout(() => resolve(buildAnswer(question)), 900));
}

// --- threads -----------------------------------------------------------
// Real backend will replace this with actual topic clustering; the shape
// (a question auto-files into a topic thread, or a manually-selected one)
// is what pages are built against, so only this section needs to change.

const CATCHALL_ENTITY = { id: "quick-asks", title: "Quick asks" };

const ENTITY_RULES = [
  { id: "flight-dl1847", title: "Delta flight — Sept 6", keywords: ["flight", "delta", "dl 1847", "dl1847", "check-in", "checkin", "gate", "sfo"] },
  { id: "invoice-4471", title: "Invoice #4471", keywords: ["invoice", "4471", "payment", "due friday"] },
  { id: "conflict-team-sync", title: "Team Sync / Client Call conflict", keywords: ["team sync", "client call", "conflict", "reschedule", "overlap"] },
  { id: "gift-anniversary", title: "Anniversary gift", keywords: ["gift", "anniversary", "order", "shopping", "shipped", "discount"] },
];

function detectEntity(text) {
  const lower = text.toLowerCase();
  for (const rule of ENTITY_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule;
  }
  return CATCHALL_ENTITY;
}

function threadsKey(userId) {
  return `ori_threads_${userId}`;
}

function readThreads(userId) {
  try {
    return JSON.parse(localStorage.getItem(threadsKey(userId))) || [];
  } catch {
    return [];
  }
}

function writeThreads(userId, threads) {
  localStorage.setItem(threadsKey(userId), JSON.stringify(threads));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function getThreads(userId) {
  return readThreads(userId)
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getThread(userId, threadId) {
  return readThreads(userId).find((t) => t.id === threadId) || null;
}

// an explicit "+ New thread" — the manual-override escape hatch alongside
// auto-filing
export function createThread(userId, title = "New thread") {
  const threads = readThreads(userId);
  const thread = { id: makeId("thread"), title, entityId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  threads.push(thread);
  writeThreads(userId, threads);
  return thread;
}

export function renameThread(userId, threadId, title) {
  const threads = readThreads(userId);
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) return null;
  thread.title = title;
  writeThreads(userId, threads);
  return thread;
}

// move a question+answer pair to a different thread — the fix-it path for
// when auto-filing gets it wrong
export function moveMessageGroup(userId, fromThreadId, groupId, toThreadId) {
  const threads = readThreads(userId);
  const from = threads.find((t) => t.id === fromThreadId);
  const to = threads.find((t) => t.id === toThreadId);
  if (!from || !to || from.id === to.id) return null;
  const moved = from.messages.filter((m) => m.groupId === groupId);
  from.messages = from.messages.filter((m) => m.groupId !== groupId);
  to.messages.push(...moved);
  to.updatedAt = new Date().toISOString();
  writeThreads(userId, threads);
  return { from, to };
}

// files a question. A clear topic match always wins and routes to that
// entity's thread, even if a different thread is currently open — that's
// the whole point of auto-segregation, and it's what lets two unrelated
// questions asked back-to-back land in different threads without the user
// managing anything. Only a question with NO clear topic (a vague
// follow-up like "and next week?") falls back to whatever thread is
// currently open, on the assumption it continues that conversation.
export function fileQuestion(userId, question, activeThreadId = null) {
  const threads = readThreads(userId);
  const entity = detectEntity(question);
  let thread = null;

  if (entity.id !== CATCHALL_ENTITY.id) {
    thread = threads.find((t) => t.entityId === entity.id);
  } else if (activeThreadId) {
    thread = threads.find((t) => t.id === activeThreadId);
  }

  if (!thread) {
    thread = { id: makeId("thread"), title: entity.title, entityId: entity.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
    threads.push(thread);
  }

  const groupId = makeId("msg");
  const now = new Date().toISOString();
  thread.messages.push({ groupId, role: "question", text: question, at: now });
  thread.updatedAt = now;
  writeThreads(userId, threads);
  return { threadId: thread.id, groupId };
}

export function appendAnswer(userId, threadId, groupId, { answer, citations }) {
  const threads = readThreads(userId);
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) return null;
  thread.messages.push({ groupId, role: "answer", answer, citations, at: new Date().toISOString() });
  thread.updatedAt = new Date().toISOString();
  writeThreads(userId, threads);
  return thread;
}
