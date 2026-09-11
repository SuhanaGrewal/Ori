// A real (if deliberately simple) entity/topic-clustering heuristic -
// replaces the hardcoded 4-keyword demo stub that used to live in
// mockApi.js's detectEntity(), which only ever recognized 4 canned
// scenarios and can't generalize to real content. Pure functions only:
// no localStorage, no React, no network - cardStore.js owns persistence
// and orchestration, this module only ever answers "how related are
// these two things."
//
// Two separate jobs, two separate (and different) thresholds:
// (1) which sidebar topic CLUSTER a question belongs to - coarse, and
// (2) whether it's a tight enough follow-up to NEST inside the most
// recently active card in that cluster, rather than start a new
// sibling card - narrow, a stricter relation than cluster membership.
// Conflating these two into one threshold would either make every
// related-but-distinct question collapse into one giant card, or make
// genuine follow-ups ("and who signed off on that?") spawn new cards.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "at", "by", "for",
  "with", "about", "against", "between", "into", "through", "during", "before", "after",
  "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under",
  "again", "further", "once", "here", "there", "all", "any", "both", "each", "few", "more",
  "most", "other", "some", "such", "only", "own", "same", "so", "than", "too", "very",
  "can", "will", "just", "should", "now", "this", "that", "these", "those", "is", "are",
  "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does",
  "did", "doing", "would", "could", "might", "must", "shall", "not", "what", "which",
  "who", "whom", "its", "my", "your", "his", "her", "their", "our", "me", "you", "him",
  "them", "us", "because", "while", "also", "still", "really", "actually", "please",
]);

const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
const MONTHS = new Set([
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
]);
const CAPITALIZED_STOPLIST = new Set(["i", "ok", "okay", "ori"]);

const TITLE_CASE_PHRASE_RE = /\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){1,3}\b/g;

// found live: 0.15 comfortably groups genuinely related real questions
// (shared sender/subject/proper-noun terms) while staying well below
// the overlap two truly unrelated questions produce by chance.
export const CLUSTER_MATCH_THRESHOLD = 0.15;
// deliberately stricter than cluster membership - nesting as a mini-
// thread is a tighter relation ("this specific follow-up") than "same
// general topic."
export const FOLLOWUP_MATCH_THRESHOLD = 0.35;
export const FOLLOWUP_RECENCY_MS = 10 * 60 * 1000;
export const CLUSTER_TERM_DECAY = 0.9;
export const MAX_CLUSTER_TERMS = 40;

export const CATCHALL_CLUSTER_ID = "cluster_quick-asks";
export const CATCHALL_CLUSTER_TITLE = "Quick asks";

const FOLLOWUP_REFERENCE_RE =
  /^(and|so|but|also|ok|okay)?\s*(who|what|when|where|why|how|did|does|is|was|were|can|could|will|would)\b.*\b(that|this|it|those|these|he|she|they|him|her|them)\b/i;

function addTerm(map, term, weight) {
  const key = term.trim().toLowerCase();
  if (!key) return;
  map.set(key, (map.get(key) || 0) + weight);
}

// splits on sentence-ending punctuation so "not sentence-initial" can be
// checked per-sentence, not just at the very start of the whole text -
// a lookbehind split, not a regex a real NLP library would use, but
// good enough for "doesn't need to be perfect."
function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/);
}

// Extracts weighted candidate topic/entity terms from free text (a
// question, or later an answer/citation). Three tiers, most to least
// specific, each excluding terms already captured by a higher tier so
// e.g. "Acme Contract" isn't ALSO counted as "acme" + "contract"
// separately:
//   1. multi-word Title-Case phrases ("Acme Contract") - weight 3
//   2. single capitalized words, not sentence-initial (so "The" at the
//      start of a sentence doesn't look like a proper noun), excluding
//      weekday/month names and a small stoplist - weight 2
//   3. remaining lowercase, non-stopword tokens of length >= 5 - weight 1
export function extractSignals(text) {
  const map = new Map();
  if (!text) return map;

  const consumed = new Set();
  const phrases = text.match(TITLE_CASE_PHRASE_RE) || [];
  for (const phrase of phrases) {
    addTerm(map, phrase, 3);
    phrase.toLowerCase().split(/\s+/).forEach((word) => consumed.add(word));
  }

  for (const sentence of splitSentences(text)) {
    const tokens = sentence.match(/[A-Za-z][A-Za-z'-]*/g) || [];
    tokens.forEach((raw, index) => {
      const lower = raw.toLowerCase();
      if (consumed.has(lower)) return;
      const isCapitalized = /^[A-Z]/.test(raw);

      if (
        isCapitalized &&
        index > 0 &&
        raw.length >= 3 &&
        !WEEKDAYS.has(lower) &&
        !MONTHS.has(lower) &&
        !CAPITALIZED_STOPLIST.has(lower)
      ) {
        addTerm(map, lower, 2);
      } else if (!isCapitalized && !STOPWORDS.has(lower) && lower.length >= 5) {
        addTerm(map, lower, 1);
      }
    });
  }

  return map;
}

// Run once an answer comes back - citations carry real, reliable
// entity-shaped signal (an actual sender name, an actual subject line)
// that's often stronger than anything extractable from the question
// text alone.
export function extractCitationSignals(citations) {
  const map = new Map();
  if (!citations || citations.length === 0) return map;

  for (const { label, detail } of citations) {
    const emailMatch = label && label.match(/^(.*?)\s*<([^>]+)>/);
    if (emailMatch) {
      const displayName = emailMatch[1].trim();
      const email = emailMatch[2].trim();
      if (displayName) addTerm(map, displayName, 3);
      const domain = email.split("@")[1];
      if (domain) addTerm(map, domain, 2);
    } else if (label) {
      addTerm(map, label, 3);
    }

    if (detail) {
      const cleanDetail = detail.replace(/^(re|fwd):\s*/i, "");
      const phrases = cleanDetail.match(TITLE_CASE_PHRASE_RE) || [];
      for (const phrase of phrases) addTerm(map, phrase, 3);
    }
  }

  return map;
}

// weighted Jaccard: shared terms count toward the overlap in proportion
// to how strongly BOTH sides weight them, not just whether they're
// present - two documents that both mention "Acme Contract" heavily
// score higher than two that each mention it only in passing.
export function scoreOverlap(mapA, mapB) {
  if (!mapA || !mapB || mapA.size === 0 || mapB.size === 0) return 0;
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  let intersection = 0;
  let union = 0;
  for (const key of keys) {
    const a = mapA.get(key) || 0;
    const b = mapB.get(key) || 0;
    intersection += Math.min(a, b);
    union += Math.max(a, b);
  }
  return union === 0 ? 0 : intersection / union;
}

export function objectToMap(obj) {
  return new Map(Object.entries(obj || {}));
}

export function mapToObject(map) {
  return Object.fromEntries(map);
}

function toTitleCase(term) {
  return term
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Picks a short, human-readable cluster name from its strongest terms -
// one term ("Acme Contract") most of the time, or two joined with " / "
// when a second term is comparably weighted (a genuinely two-entity
// topic, like a person and the deal they're tied to), rather than
// always tacking on a second, much weaker term nobody would recognize
// the cluster by.
export function deriveClusterTitle(signals) {
  if (!signals || signals.size === 0) return "General";
  const sorted = [...signals.entries()].sort((a, b) => b[1] - a[1]);
  const [topTerm, topWeight] = sorted[0];
  const top = [toTitleCase(topTerm)];
  if (sorted.length > 1 && sorted[1][1] >= topWeight * 0.6) {
    top.push(toTitleCase(sorted[1][0]));
  }
  return top.join(" / ");
}

// Coarse cluster-membership decision. Empty signals (a genuinely vague
// question like "what's due this week?") always routes to the catch-all
// - a real heuristic would otherwise fragment generic questions into
// pointless one-card clusters, the one part of the old demo's
// CATCHALL_ENTITY worth keeping.
export function pickBestCluster(clusters, signals) {
  if (!signals || signals.size === 0) {
    return { cluster: null, isCatchAll: true };
  }

  let best = null;
  let bestScore = 0;
  for (const cluster of clusters) {
    const score = scoreOverlap(signals, objectToMap(cluster.entityTerms));
    if (score > bestScore) {
      bestScore = score;
      best = cluster;
    }
  }

  if (best && bestScore >= CLUSTER_MATCH_THRESHOLD) {
    return { cluster: best, isCatchAll: false };
  }
  return { cluster: null, isCatchAll: false };
}

// Folds new signals into a cluster's running term map: existing weights
// decay first (so a cluster's identity tracks what it's RECENTLY been
// about, not just whatever it started as), then new terms are added,
// then the map is pruned back down - keeps a long-lived cluster's term
// set from drifting unboundedly as more cards land in it.
export function decayAndMergeTerms(existingTerms, newSignals) {
  const merged = new Map();
  for (const [term, weight] of Object.entries(existingTerms || {})) {
    merged.set(term, weight * CLUSTER_TERM_DECAY);
  }
  for (const [term, weight] of newSignals) {
    merged.set(term, (merged.get(term) || 0) + weight);
  }
  const pruned = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CLUSTER_TERMS);
  return Object.fromEntries(pruned);
}

// Narrow "is this a direct follow-up on the most recent card" check -
// only ever compared against the single latest card in the cluster
// already chosen above, never the whole cluster's history at once.
// True if it's recent enough AND either reads like an anaphoric
// follow-up ("and who signed off on that?") or shares unusually strong
// term overlap with that one card specifically.
export function isLikelyFollowUp(latestCard, questionText, signals, now = new Date()) {
  if (!latestCard) return false;
  const updatedAt = new Date(latestCard.updatedAt).getTime();
  if (Number.isNaN(updatedAt) || now.getTime() - updatedAt >= FOLLOWUP_RECENCY_MS) return false;

  if (FOLLOWUP_REFERENCE_RE.test(questionText.trim())) return true;

  return scoreOverlap(signals, objectToMap(latestCard.entityTerms)) >= FOLLOWUP_MATCH_THRESHOLD;
}
