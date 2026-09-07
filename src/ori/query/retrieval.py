from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np

from ori.indexing.hybrid_search import hybrid_search
from ori.indexing.store import IndexStore
from ori.query.date_range import _DATE_METADATA_KEYS, chunk_in_range, parse_stored_date
from ori.query.reranker import rerank

# how close a lower-ranked score needs to be to the top score before
# "which one is actually #1" is treated as noise rather than a real
# quality signal - found live, twice: asking the identical question
# multiple times against three near-identical real receipts (from two
# different Anthropic billing entities, worded slightly differently)
# picked a different one each time, never the actually most-recent one.
# Measured the real scores directly: the true most-recent receipt scored
# 0.21 against a top score of 0.30 - a real ~0.09 gap, wider than an
# initial, more conservative 0.05 epsilon that only fixed the tie between
# the two OLDER receipts and still missed the newest one. 0.12 comfortably
# covers the real gap measured while staying far below the gap to
# genuinely irrelevant candidates (0.0 in that same real pool).
_RECENCY_TIEBREAK_EPSILON = 0.12

AbstainReason = Literal["no_candidates", "no_candidates_in_date_range", "low_confidence", "no_upcoming_match"]
# "no_upcoming_match" is never returned by retrieve() itself - it's set by
# answer.py::ask() when a forward-looking date query (e.g. "upcoming
# flights") finds nothing even after falling back to an unfiltered search,
# so the abstain message can say plainly "nothing upcoming, and no past
# record either" instead of the more generic date-range message.


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: str
    source: str
    source_item_id: str
    parent_text: str
    metadata: dict
    confidence: float


@dataclass(frozen=True)
class RetrievalResult:
    chunks: list[RetrievedChunk]
    confidence: float
    abstained: bool
    abstain_reason: AbstainReason | None


def _fetch_and_filter_candidates(
    store: IndexStore,
    chunk_ids: list[str],
    date_range: tuple | None,
    excluded_sources: frozenset[str] | None = None,
) -> list[sqlite3.Row]:
    """resolves fused search ids into full rows, applies the date filter (if
    any), and collapses multiple child-chunk hits from the same parent into
    one candidate - there's no separate parent table, so (source,
    source_item_id, parent_text) is the correct dedup key. preserves the
    input's rank order throughout.

    excluded_sources is a post-filter, same as date_range - the caller
    (webchat/server.py) maps a user's revoked OAuth scopes to source
    names and passes them here so a revoked source's content is excluded
    from an answer, not just the citation display. A post-filter rather
    than pushing the exclusion down into hybrid_search()'s own SQL is a
    deliberate, lower-risk choice: date_range filtering already works
    this same way in this exact function, and revoking a scope is rare
    enough that the (small) chance of a revoked source crowding out an
    allowed one in the initial candidate pool isn't worth a wider,
    riskier change to the SQL-level search functions."""
    rows = []
    for chunk_id in chunk_ids:
        row = store.get_chunk_row(chunk_id)
        if row is not None:
            rows.append(row)

    if excluded_sources:
        rows = [row for row in rows if row["source"] not in excluded_sources]

    if date_range is not None:
        rows = [
            row
            for row in rows
            if chunk_in_range(row["source"], json.loads(row["metadata_json"]), date_range)
        ]

    seen_parents: set[tuple[str, str, str]] = set()
    deduped = []
    for row in rows:
        key = (row["source"], row["source_item_id"], row["parent_text"])
        if key in seen_parents:
            continue
        seen_parents.add(key)
        deduped.append(row)

    return deduped


def row_to_chunk(row: sqlite3.Row, confidence: float) -> RetrievedChunk:
    """builds a RetrievedChunk from a raw `chunks` table row - shared by
    retrieve() below and query/answer.py's fallback-before-abstain path,
    which recovers a specific prior chunk by id (IndexStore.get_chunk_row)
    rather than through a fresh search."""
    return RetrievedChunk(
        chunk_id=row["chunk_id"],
        source=row["source"],
        source_item_id=row["source_item_id"],
        parent_text=row["parent_text"],
        metadata=json.loads(row["metadata_json"]),
        confidence=confidence,
    )


def _row_date(row: sqlite3.Row):
    """the same per-source date lookup date_range.py's chunk_in_range()
    already uses (gmail -> sent_at, calendar -> start_at; every other
    source has no date concept and returns None) - reused here rather
    than reimplemented, for the recency tiebreak below."""
    metadata_key = _DATE_METADATA_KEYS.get(row["source"])
    if metadata_key is None:
        return None
    return parse_stored_date(json.loads(row["metadata_json"]).get(metadata_key))


def _break_near_ties_by_recency(
    ranked: list[tuple[sqlite3.Row, float]],
) -> tuple[list[tuple[sqlite3.Row, float]], bool]:
    """found live: asking the identical question several times against
    three near-identical real receipts (from two different Anthropic
    billing entities, worded slightly differently) picked a different one
    each time via whichever happened to score a hair higher, and never
    the actually most-recent one - the kind of tiebreak a human would
    obviously make correctly, left instead to reranker noise.

    Compares against the WHOLE group within epsilon of the top score, not
    just the immediate #2 - an earlier version of this only checked the
    top pair and missed the case where the true most-recent document
    scored close to, but not adjacent to, the top: measured directly
    against the real receipts, the true most-recent one scored ~0.09
    below the top candidate while a genuinely-older one sat right next to
    it at ~0.02 below - a top-2-only comparison would "fix" the wrong
    pair. Among whichever of the top-ranked candidates are close enough
    to be noise AND have a parseable date, the most recent one wins -
    deterministic date arithmetic over a document's own real timestamp,
    matching this project's existing "deterministic over LLM for date
    reasoning" philosophy, not a new judgment call. A single candidate
    with no close competitors, or one where no two candidates in the tied
    group have parseable dates, is left exactly as reranked.

    Returns whether a swap actually happened alongside the (possibly
    reordered) list - retrieve() uses that to know a real, resolved near-
    tie was found here, as opposed to one genuinely low-confidence
    candidate with nothing else close to it."""
    if len(ranked) < 2:
        return ranked, False

    top_score = ranked[0][1]
    tied = [item for item in ranked if abs(item[1] - top_score) <= _RECENCY_TIEBREAK_EPSILON]
    if len(tied) < 2:
        return ranked, False

    dated = [(item, date) for item in tied if (date := _row_date(item[0])) is not None]
    if len(dated) < 2:
        return ranked, False

    most_recent, _ = max(dated, key=lambda pair: pair[1])
    if most_recent is ranked[0]:
        return ranked, False

    return [most_recent, *(item for item in ranked if item is not most_recent)], True


def retrieve(
    store: IndexStore,
    question: str,
    question_embedding: np.ndarray,
    *,
    reranker: Any,
    date_range: tuple | None = None,
    source: str | None = None,
    excluded_sources: frozenset[str] | None = None,
    logger: logging.Logger | None = None,
    initial_pool_k: int = 60,
    rerank_pool: int = 20,
    top_k: int = 5,
    abstain_threshold: float = 0.5,
) -> RetrievalResult:
    """the full retrieval pipeline: hybrid search for an initial candidate
    pool, resolve/date-filter/dedup to parent-level candidates, rerank on
    parent_text (the same text that grounds the final answer), keep the
    top_k, and abstain if the single best match isn't confident enough.

    initial_pool_k/rerank_pool were widened (25->60, 10->20) after real
    testing found genuinely-indexed content (a CV with 5 real matching
    chunks) never reaching the reranker at all at the old, narrower pool
    size on a real, multi-thousand-chunk index - a mechanical fix for "not
    enough candidates considered," not a fix for a true vocabulary gap
    (a document sharing no words/concepts with the question at all), which
    needs actual measurement (an eval harness, not built yet) to safely
    address."""
    fused = hybrid_search(store, question, question_embedding, k=initial_pool_k, source=source)
    if not fused:
        return RetrievalResult(chunks=[], confidence=0.0, abstained=True, abstain_reason="no_candidates")

    chunk_ids = [chunk_id for chunk_id, _ in fused]
    candidates = _fetch_and_filter_candidates(store, chunk_ids, date_range, excluded_sources)

    if not candidates:
        reason = "no_candidates_in_date_range" if date_range is not None else "no_candidates"
        return RetrievalResult(chunks=[], confidence=0.0, abstained=True, abstain_reason=reason)

    pool = candidates[:rerank_pool]
    scores = rerank(reranker, question, [row["parent_text"] for row in pool])

    ranked = sorted(zip(pool, scores), key=lambda item: item[1], reverse=True)[:top_k]
    ranked, recency_tiebroken = _break_near_ties_by_recency(ranked)

    chunks = [row_to_chunk(row, score) for row, score in ranked]

    top_confidence = chunks[0].confidence if chunks else 0.0
    # a resolved recency tiebreak is its own confidence signal: it only
    # fires when 2+ candidates independently scored close enough to the
    # top to be noise AND both carry a real date - i.e. the reranker
    # already judged them all plausibly relevant, and recency picked
    # which one. Abstaining anyway (because the *chosen* one's own raw
    # score happens to sit below the threshold) would hand the decision
    # to ask()'s downstream per-candidate LLM relevance tiebreak instead -
    # a real, non-deterministic Claude call that iterates the same
    # candidates in whatever order they arrive and can reject the one
    # this recency check just deterministically chose, falling through to
    # an older one. Confirmed live: exactly this happened, silently
    # reintroducing the "same question, different wrong answer" bug this
    # tiebreak exists to remove. Trusting the tiebreak's own resolution
    # avoids relitigating it through a second, less predictable mechanism
    # built for a different failure mode (a single ambiguous candidate,
    # not several genuinely-close real ones).
    abstained = top_confidence < abstain_threshold and not recency_tiebroken

    if logger is not None:
        logger.info(
            "query retrieval complete",
            extra={
                "operation": "query.retrieve",
                "status": "success",
                "duration_ms": 0,
                "candidates_found": len(candidates),
                "top_confidence": top_confidence,
                "abstained": abstained,
            },
        )

    return RetrievalResult(
        chunks=chunks,
        confidence=top_confidence,
        abstained=abstained,
        abstain_reason="low_confidence" if abstained else None,
    )
