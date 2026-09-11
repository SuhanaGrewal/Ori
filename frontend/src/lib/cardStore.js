// Persistence + orchestration for the Ask page's card archive: the
// "cluster" (sidebar topic bucket) / "card" (one saved question+answer
// artifact, which can carry its own nested follow-ups) data model. A
// new, parallel module rather than a retrofit of mockApi.js's thread
// system - that shape conflates cluster and card into one flat
// messages[] list, one level of nesting short of what this needs.
// mockApi.js/realApi.js's thread exports (getThreads, createThread,
// renameThread, moveMessageGroup, fileQuestion, appendAnswer) are left
// completely alone and unused by this page.

import {
  extractSignals,
  extractCitationSignals,
  pickBestCluster,
  isLikelyFollowUp,
  deriveClusterTitle,
  decayAndMergeTerms,
  mapToObject,
  CATCHALL_CLUSTER_ID,
  CATCHALL_CLUSTER_TITLE,
} from "./entityClustering";

function storeKey(userId) {
  return `ori_ask_cards_${userId}`;
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStore() {
  return { clusters: [], cards: [] };
}

// same try/catch-JSON pattern as mockApi.js's readThreads/writeThreads -
// a corrupted or missing key should never crash the page, just look
// like a fresh, empty archive.
function readStore(userId) {
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    return { clusters: parsed.clusters || [], cards: parsed.cards || [] };
  } catch {
    return emptyStore();
  }
}

function writeStore(userId, store) {
  localStorage.setItem(storeKey(userId), JSON.stringify(store));
}

function getOrCreateCatchAll(store, now) {
  let cluster = store.clusters.find((c) => c.id === CATCHALL_CLUSTER_ID);
  if (!cluster) {
    cluster = { id: CATCHALL_CLUSTER_ID, title: CATCHALL_CLUSTER_TITLE, entityTerms: {}, createdAt: now, updatedAt: now };
    store.clusters.push(cluster);
  }
  return cluster;
}

function latestCardInCluster(store, clusterId) {
  const cards = store.cards.filter((card) => card.clusterId === clusterId);
  if (cards.length === 0) return null;
  return cards.reduce((latest, card) => (new Date(card.updatedAt) > new Date(latest.updatedAt) ? card : latest));
}

// Files a brand-new question: picks (or creates) its cluster, folds the
// question's own signal into that cluster's running term map, decides
// whether it nests as a follow-up under the cluster's most recently
// active card, and writes a `pending` placeholder immediately (before
// the backend has answered) so the UI can render it optimistically.
//
// threadId scoping is the important part here: a brand-new card always
// gets its own fresh backend thread_id - self-contained, per the
// product requirement that a card is a saved artifact, not a
// conversational turn that needs context from the last one. Only a
// NESTED follow-up reuses its parent card's threadId, since that's the
// one case where the backend's own follow-up-question-rewriting should
// legitimately see prior turns at all ("who signed off on that").
export function fileNewQuestion(userId, questionText) {
  const store = readStore(userId);
  const now = new Date().toISOString();
  const signals = extractSignals(questionText);

  const { cluster: matched, isCatchAll } = pickBestCluster(store.clusters, signals);
  let cluster = matched;
  if (isCatchAll) {
    cluster = getOrCreateCatchAll(store, now);
  } else if (!cluster) {
    cluster = { id: makeId("cluster"), title: deriveClusterTitle(signals), entityTerms: {}, createdAt: now, updatedAt: now };
    store.clusters.push(cluster);
  }
  cluster.entityTerms = decayAndMergeTerms(cluster.entityTerms, signals);

  const latest = latestCardInCluster(store, cluster.id);
  const nests = isLikelyFollowUp(latest, questionText, signals, new Date(now));

  let result;
  if (nests) {
    const followUp = {
      id: makeId("fu"), question: questionText, answer: null, citations: [],
      pending: true, entityTerms: mapToObject(signals), createdAt: now,
    };
    latest.followUps.push(followUp);
    latest.updatedAt = now;
    cluster.updatedAt = now;
    result = { clusterId: cluster.id, cardId: latest.id, followUpId: followUp.id, threadId: latest.threadId };
  } else {
    const card = {
      id: makeId("card"), clusterId: cluster.id, question: questionText, answer: null, citations: [],
      pending: true, entityTerms: mapToObject(signals), createdAt: now, updatedAt: now,
      threadId: makeId("thread"), followUps: [],
    };
    store.cards.push(card);
    cluster.updatedAt = now;
    result = { clusterId: cluster.id, cardId: card.id, followUpId: null, threadId: card.threadId };
  }

  writeStore(userId, store);
  return result;
}

// Fills in the answer half of a question/answer pair once the backend
// responds - locates the right card (and, if this was a nested
// follow-up, the right entry in its followUps[]) by the ids
// fileNewQuestion() returned, and folds the citations' own entity
// signal (real sender names/subjects - often stronger signal than the
// question text alone) into both the card and the cluster's running
// term map.
export function attachAnswer(userId, { clusterId, cardId, followUpId }, { answer, citations, title }) {
  const store = readStore(userId);
  const now = new Date().toISOString();
  const cluster = store.clusters.find((c) => c.id === clusterId);
  const card = store.cards.find((c) => c.id === cardId);
  if (!cluster || !card) return;

  const citationSignals = extractCitationSignals(citations);
  const target = followUpId ? card.followUps.find((f) => f.id === followUpId) : card;
  if (!target) return;

  target.answer = answer;
  target.citations = citations || [];
  target.pending = false;
  // only a brand-new top-level card gets a generated title (see
  // realApi.js's getAnswer) - a follow-up's `target` is a followUps[]
  // entry, which has no `title` field to set at all, so this is a no-op
  // there by construction, not a special case that needs its own check.
  if (title && !followUpId) {
    card.title = title;
  }
  for (const [term, weight] of citationSignals) {
    target.entityTerms[term] = (target.entityTerms[term] || 0) + weight;
  }

  // A cluster's title is picked at creation time from the QUESTION's own
  // wording alone, before any answer exists - real testing found this
  // often reads as "a random word from the query" rather than a real
  // topic. A citation's sender name / subject line is usually much more
  // topic-shaped than raw question phrasing, so on a cluster's very
  // first card, re-derive the title once real citation signal exists -
  // one-time upgrade, not a running rename (a cluster's title shouldn't
  // keep shifting under later, unrelated cards that happen to land in
  // the catch-all-turned-real cluster).
  const isFirstCardInCluster = !followUpId && store.cards.filter((c) => c.clusterId === cluster.id).length === 1;
  if (isFirstCardInCluster && cluster.id !== CATCHALL_CLUSTER_ID) {
    const combined = extractSignals(card.question);
    for (const [term, weight] of citationSignals) {
      combined.set(term, (combined.get(term) || 0) + weight);
    }
    const upgraded = deriveClusterTitle(combined);
    if (upgraded !== "General") cluster.title = upgraded;
  }

  card.updatedAt = now;
  cluster.updatedAt = now;
  cluster.entityTerms = decayAndMergeTerms(cluster.entityTerms, citationSignals);

  writeStore(userId, store);
}

// Explicit, user-chosen "thread out from this card" - unlike
// fileNewQuestion()'s automatic recency+entity-overlap guess, this
// always nests under the exact card the user clicked "follow up" on,
// no heuristic involved. Reuses that card's own threadId, same as an
// auto-detected nest, since the backend should see prior turns here too.
export function fileFollowUpOnCard(userId, cardId, questionText) {
  const store = readStore(userId);
  const now = new Date().toISOString();
  const card = store.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const cluster = store.clusters.find((c) => c.id === card.clusterId);

  const signals = extractSignals(questionText);
  const followUp = {
    id: makeId("fu"), question: questionText, answer: null, citations: [],
    pending: true, entityTerms: mapToObject(signals), createdAt: now,
  };
  card.followUps.push(followUp);
  card.updatedAt = now;
  if (cluster) {
    cluster.updatedAt = now;
    cluster.entityTerms = decayAndMergeTerms(cluster.entityTerms, signals);
  }

  writeStore(userId, store);
  return { clusterId: card.clusterId, cardId: card.id, followUpId: followUp.id, threadId: card.threadId };
}

function clusterTitleFor(store, clusterId) {
  const cluster = store.clusters.find((c) => c.id === clusterId);
  return cluster ? cluster.title : null;
}

// One specific card, with its topic's current title attached - the
// shape the focused-card view needs after the user opens something from
// RecentQueriesRail or just asked a fresh question.
export function getFocusedCard(userId, cardId) {
  const store = readStore(userId);
  const card = store.cards.find((c) => c.id === cardId);
  if (!card) return null;
  return { ...card, clusterTitle: clusterTitleFor(store, card.clusterId) };
}

export function getAllCardsFlat(userId) {
  const store = readStore(userId);
  return [...store.cards]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((card) => ({ ...card, clusterTitle: clusterTitleFor(store, card.clusterId) }));
}

function textMatches(haystack, needle) {
  return (haystack || "").toLowerCase().includes(needle);
}

function citationsMatch(citations, needle) {
  return (citations || []).some((c) => textMatches(c.label, needle) || textMatches(c.detail, needle));
}

function cardMatchesQuery(card, needle) {
  if (textMatches(card.title, needle) || textMatches(card.question, needle) || textMatches(card.answer, needle)) return true;
  if (citationsMatch(card.citations, needle)) return true;
  return (card.followUps || []).some(
    (f) => textMatches(f.question, needle) || textMatches(f.answer, needle) || citationsMatch(f.citations, needle)
  );
}

// Case-insensitive substring search across a card's own text and every
// nested follow-up's text - a match returns the WHOLE card (with its
// follow-ups intact), not just the matching follow-up in isolation, so
// context isn't lost mid-thread.
export function searchCards(userId, queryText) {
  const needle = (queryText || "").trim().toLowerCase();
  if (!needle) return getAllCardsFlat(userId);
  return getAllCardsFlat(userId).filter((card) => cardMatchesQuery(card, needle));
}
