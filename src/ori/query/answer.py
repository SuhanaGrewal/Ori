from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from ori.conversation.followup import rewrite_followup_question
from ori.indexing.embedder import embed_chunks
from ori.indexing.store import IndexStore
from ori.query.anthropic_client import call_claude
from ori.query.compound import maybe_split_compound_question
from ori.query.date_range import extract_date_range, is_forward_looking_range
from ori.query.prompt import (
    SYSTEM_PROMPT,
    TIEBREAK_SYSTEM_PROMPT,
    build_abstain_message,
    build_tiebreak_user_message,
    build_user_message,
    format_sources,
)
from ori.query.retrieval import AbstainReason, RetrievedChunk, retrieve, row_to_chunk
from ori.redaction.tokenize import tokenize_for_external_call, untokenize
from ori.security.audit_log import record_event

# a simple fixed window, not a summarization strategy - bounds prompt
# growth for a long-running thread by keeping only the most recent turns
# (5 question/answer pairs) rather than letting it grow without bound.
_MAX_CONVERSATION_HISTORY_TURNS = 10


def _llm_confirms_relevance(
    question: str, candidate_text: str, *, client: Any, model: str, analyzer: Any,
    logger: logging.Logger | None = None, audit_log_dir: Path | None = None,
) -> bool:
    """a last-resort check before abstaining: the local cross-encoder
    reranker (a small MiniLM model) occasionally scores a genuinely
    correct top candidate too low to trust - confirmed via real testing
    on typo-laden or vocabulary-mismatched questions where the actual
    answer existed but the reranker's score was nowhere near the abstain
    threshold. Rather than adding a second, heavier reranker model (which
    would likely share the same blind spot - it's a vocabulary-matching
    limitation, not a model-size one), this reuses Claude itself, the same
    "ask the LLM to judge instead of guessing" pattern already used
    throughout this project (commitment filtering, resolve-matching,
    reminder-matching). Only spent on the already-rare abstaining path, so
    cost stays bounded to queries that would otherwise get nothing."""
    user_message = build_tiebreak_user_message(question, candidate_text)
    tokenization = tokenize_for_external_call(user_message, analyzer=analyzer, logger=logger)
    if audit_log_dir is not None:
        record_event(
            audit_log_dir, "llm.external_call",
            {"operation": "query.rerank_tiebreak", "entity_counts": tokenization.entity_counts},
        )
    raw = call_claude(
        client, model=model, system=TIEBREAK_SYSTEM_PROMPT, user_message=tokenization.tokenized_text,
        max_tokens=10, logger=logger,
    )
    return "YES" in raw.strip().upper()


_TRAILING_PUNCTUATION = ".?! "


def _was_actually_rewritten(question: str, effective_question: str) -> bool:
    """a strict string comparison is too fragile to answer "was this
    follow-up actually resolved against prior context, or did it already
    stand on its own" - confirmed live: rewrite_followup_question() is
    explicitly told to return an already-self-contained question
    completely unchanged, but a real Claude call still capitalized "was"
    -> "Was" on an otherwise-untouched question. Case/whitespace/trailing-
    punctuation noise like that isn't a real rewrite; comparing after
    normalizing it out is what actually distinguishes "the model resolved
    a pronoun/implicit reference" from "the model tidied up formatting on
    an already-fine question." """

    def _normalize(text: str) -> str:
        return " ".join(text.strip().casefold().split()).rstrip(_TRAILING_PUNCTUATION)

    return _normalize(question) != _normalize(effective_question)


def _recover_previous_grounding(history: list[Any], *, store: IndexStore) -> list[RetrievedChunk]:
    """last resort before abstaining on a follow-up: retrieve() runs a
    fresh, independent search for every question, with no notion that a
    follow-up seconds after a grounded answer is almost always still
    about that same document - confirmed via real testing where a
    follow-up correctly got rewritten to be about the right item (e.g.
    "when will my PAN application be delivered") but the item's own text
    ("processed", "e-PAN file attached") has too little textual/semantic
    overlap with the follow-up's own wording ("delivered") to clear the
    reranker's confidence threshold on its own.

    Scans history (oldest-first) from the end for the most recent
    assistant turn that recorded which chunks grounded it (see
    ConversationStore.add_turn's chunk_ids), and re-fetches those exact
    chunks by id - not a fresh search, just "what were we just definitely
    looking at." SYSTEM_PROMPT's own "stay scoped to the same item... say
    so plainly if it's not there" instruction does the rest. Returns []
    if no prior grounded turn exists (a fresh conversation, or one where
    every turn so far has itself abstained) - callers should abstain
    exactly as before in that case."""
    for turn in reversed(history):
        if turn["role"] != "assistant" or not turn["chunk_ids_json"]:
            continue
        chunk_ids = json.loads(turn["chunk_ids_json"])
        rows = [store.get_chunk_row(chunk_id) for chunk_id in chunk_ids]
        return [row_to_chunk(row, 1.0) for row in rows if row is not None]
    return []


@dataclass(frozen=True)
class AnswerResult:
    question: str
    chunks: list[RetrievedChunk]
    confidence: float
    abstained: bool
    abstain_reason: AbstainReason | None
    answer: str | None
    sources: str | None
    llm_configured: bool


def ask(
    question: str,
    *,
    store: IndexStore,
    embedder: Any,
    reranker: Any,
    analyzer: Any,
    client: Any,
    model: str,
    source: str | None = None,
    excluded_sources: frozenset[str] | None = None,
    now: datetime | None = None,
    logger: logging.Logger | None = None,
    audit_log_dir: Path | None = None,
    conversation_id: str | None = None,
    conversation_store: Any = None,
) -> AnswerResult:
    """runs the full query pipeline: retrieve, then either abstain, report
    retrieval-only results (no api key configured), or generate a grounded
    answer.

    the redaction mapping is a local variable here, built by exactly one
    tokenize_for_external_call() covering the whole prompt and consumed by
    exactly one untokenize() on the response - it never outlives this call
    and is never persisted, per the project's redaction design.

    conversation_id/conversation_store are both optional (default None,
    same pattern as every other optional store threaded through this
    project) - when both are given, prior turns in that thread are used
    to (1) rewrite a bare follow-up like "what about next month" into a
    standalone, retrievable question, and (2) give the final answer-
    generation call the same conversational context. AnswerResult.question
    always reports the original, as-typed question, not the rewritten
    one - only retrieval and the final prompt use the rewritten form."""
    now = now if now is not None else datetime.now(tz=timezone.utc)

    history: list[Any] = []
    effective_question = question
    if conversation_id is not None and conversation_store is not None:
        history = list(conversation_store.list_turns(conversation_id, limit=_MAX_CONVERSATION_HISTORY_TURNS))
        if history and client is not None:
            effective_question = rewrite_followup_question(
                history, question, client=client, model=model, analyzer=analyzer,
                logger=logger, audit_log_dir=audit_log_dir,
            )

    date_range = extract_date_range(effective_question, now=now)

    question_embedding = np.array(embed_chunks(embedder, [effective_question])[0], dtype=np.float32)

    result = retrieve(
        store,
        effective_question,
        question_embedding,
        reranker=reranker,
        date_range=date_range,
        source=source,
        excluded_sources=excluded_sources,
        logger=logger,
    )

    if result.abstained and date_range is not None and is_forward_looking_range(date_range, now=now):
        # nothing upcoming matched confidently - fall back to an
        # unfiltered search so a real past match (if one exists) can
        # still surface for context ("no upcoming flights, but here's
        # your last one") instead of just abstaining. Triggered on ANY
        # abstain reason, not just "no_candidates_in_date_range": docs/
        # local_files chunks have no date concept and always pass the
        # date filter (chunk_in_range's documented fail-open behavior),
        # so a date-filtered search with irrelevant docs still in the
        # pool typically abstains as "low_confidence" instead - the date
        # filter narrowed the pool without ever emptying it outright.
        # Removing the filter can only surface more candidates, never
        # fewer, so retrying is always safe here. SYSTEM_PROMPT already
        # knows how to frame "nothing upcoming, here's the most recent
        # past item" correctly via per-item recency labels - the filter
        # was just preventing it from ever seeing a real candidate to
        # frame that way.
        fallback = retrieve(
            store, effective_question, question_embedding, reranker=reranker, date_range=None,
            source=source, excluded_sources=excluded_sources, logger=logger,
        )
        result = fallback if not fallback.abstained else replace(fallback, abstain_reason="no_upcoming_match")

    if result.abstained and result.chunks and client is not None:
        # result.chunks is non-empty here only for a score-based abstain
        # (low_confidence / no_upcoming_match) - "no_candidates" and
        # "no_candidates_in_date_range" return an empty chunk list, so
        # there's nothing to tiebreak and this is skipped for those.
        #
        # Checks every candidate in ranked order, not just chunks[0] - a
        # heavily typo-laden question (confirmed via real testing: "wen
        # do i hav to droop off my laptp") can make the reranker score
        # every candidate near-zero, at which point the "top" one by
        # score is essentially arbitrary noise. The genuinely correct
        # email was sitting a few slots down in that same low-confidence
        # pool; checking only rank 1 missed it and abstained even though
        # the right answer was right there. Stops at the first candidate
        # the LLM actually confirms, so cost only grows on the rare
        # abstaining path, and only as far as it takes to find one.
        for candidate in result.chunks:
            if _llm_confirms_relevance(
                effective_question, candidate.parent_text, client=client, model=model, analyzer=analyzer,
                logger=logger, audit_log_dir=audit_log_dir,
            ):
                result = replace(result, abstained=False, abstain_reason=None, chunks=[candidate])
                break

    if result.abstained and history and _was_actually_rewritten(question, effective_question):
        # a genuinely self-contained question that just got a cosmetic
        # cleanup (capitalization, punctuation) is NOT the same as a real
        # follow-up that needed prior context to stand alone - confirmed
        # live: the real model rewrote "was i in the hackathons winner
        # list?" to "Was I in the hackathons winner list?" (capitalizing
        # "was") despite REWRITE_FOLLOWUP_SYSTEM_PROMPT explicitly saying
        # to return an already-self-contained question unchanged - a
        # plain string comparison treated that as "rewritten" and fired
        # this fallback anyway, forcing in the PRIOR turn's unrelated
        # British Airways flight chunk instead of ever running a real
        # search for hackathon content (a real, matching Devpost email
        # existed). Comparing case/whitespace-insensitively catches this
        # real-world rewrite noise while still recognizing a genuine
        # follow-up (e.g. "when will it be delivered" -> "when will my
        # PAN application be delivered") as actually rewritten.
        recovered = _recover_previous_grounding(history, store=store)
        if recovered:
            result = replace(result, abstained=False, abstain_reason=None, chunks=recovered, confidence=1.0)

    if result.abstained:
        return AnswerResult(
            question=question,
            chunks=result.chunks,
            confidence=result.confidence,
            abstained=True,
            abstain_reason=result.abstain_reason,
            answer=None,
            sources=None,
            llm_configured=client is not None,
        )

    if client is None:
        return AnswerResult(
            question=question,
            chunks=result.chunks,
            confidence=result.confidence,
            abstained=False,
            abstain_reason=None,
            answer=None,
            sources=None,
            llm_configured=False,
        )

    user_message = build_user_message(effective_question, result.chunks, now=now, history=history)
    tokenization = tokenize_for_external_call(user_message, analyzer=analyzer, logger=logger)
    if audit_log_dir is not None:
        record_event(
            audit_log_dir, "llm.external_call",
            {"operation": "query.ask", "entity_counts": tokenization.entity_counts},
        )
    raw_answer = call_claude(
        client,
        model=model,
        system=SYSTEM_PROMPT,
        user_message=tokenization.tokenized_text,
        logger=logger,
    )
    answer = untokenize(raw_answer, tokenization.mapping)

    if conversation_id is not None and conversation_store is not None:
        # only the successful-answer path is recorded (not an abstain) -
        # keeps this simple and avoids duplicating the abstain-message
        # text that __main__.py owns for display. A thread that hits an
        # abstain loses that turn as future rewrite context, which is an
        # acceptable, honest limitation for now rather than a silent gap.
        conversation_store.add_turn(conversation_id, "user", question)
        conversation_store.add_turn(
            conversation_id, "assistant", answer, chunk_ids=[chunk.chunk_id for chunk in result.chunks]
        )

    return AnswerResult(
        question=question,
        chunks=result.chunks,
        confidence=result.confidence,
        abstained=False,
        abstain_reason=None,
        answer=answer,
        sources=format_sources(result.chunks, now=now),
        llm_configured=True,
    )


def _renumber_citations(answer_text: str, offset: int) -> str:
    """shifts every [N] bracket marker in a sub-answer up by offset, so
    citations from several independently-run ask() calls can be
    concatenated into one answer without collisions - each sub-answer's
    own retrieve() numbers its chunks starting from [1], same as any
    other single question."""
    return re.sub(r"\[(\d+)\]", lambda m: f"[{int(m.group(1)) + offset}]", answer_text)


def ask_with_compound_split(
    question: str,
    *,
    store: IndexStore,
    embedder: Any,
    reranker: Any,
    analyzer: Any,
    client: Any,
    model: str,
    source: str | None = None,
    excluded_sources: frozenset[str] | None = None,
    now: datetime | None = None,
    logger: logging.Logger | None = None,
    audit_log_dir: Path | None = None,
    conversation_id: str | None = None,
    conversation_store: Any = None,
) -> AnswerResult:
    """wraps ask() with a compound-question check: a question genuinely
    asking about two or more distinct, unrelated topics (e.g. "whats my
    pan status and also whats the laptop drop off date") previously
    aborted retrieval entirely instead of answering either half - a
    single embedding/search pass over a two-topic question dilutes toward
    neither topic well enough to clear the confidence threshold, unlike
    either topic asked alone. Splitting first and running ask()
    independently per sub-question, then combining, fixes that without
    touching ask()'s own single-question pipeline at all (still used
    directly by digest/__main__.py and anywhere else a question is never
    compound).

    The common, single-question case still costs one extra, cheap
    classification call (same "ask a small model first" pattern as
    rewrite_followup_question) - proportionally negligible next to the
    full retrieval + generation pipeline that follows either way.

    Conversation history is intentionally NOT threaded into the per-
    sub-question ask() calls: each sub-question is expected to already be
    self-contained (the split prompt is explicitly told to resolve shared
    pronouns/context from the original), and re-running follow-up
    rewriting per sub-question would risk each one independently latching
    onto stale prior-turn context. Only the combined result is recorded
    as a single new turn pair, matching ask()'s own "only successful
    answers get recorded" rule, extended here to only when at least one
    sub-question actually answered."""
    sub_questions = maybe_split_compound_question(
        question, client=client, model=model, analyzer=analyzer, logger=logger, audit_log_dir=audit_log_dir,
    )
    if sub_questions is None:
        return ask(
            question, store=store, embedder=embedder, reranker=reranker, analyzer=analyzer, client=client,
            model=model, source=source, excluded_sources=excluded_sources, now=now, logger=logger,
            audit_log_dir=audit_log_dir, conversation_id=conversation_id, conversation_store=conversation_store,
        )

    results = [
        ask(
            sub_question, store=store, embedder=embedder, reranker=reranker, analyzer=analyzer, client=client,
            model=model, source=source, excluded_sources=excluded_sources, now=now, logger=logger,
            audit_log_dir=audit_log_dir,
        )
        for sub_question in sub_questions
    ]

    if all(result.abstained for result in results):
        return AnswerResult(
            question=question,
            chunks=[],
            confidence=0.0,
            abstained=True,
            abstain_reason=results[0].abstain_reason,
            answer=None,
            sources=None,
            llm_configured=client is not None,
        )

    combined_chunks: list[RetrievedChunk] = []
    parts = []
    for sub_question, result in zip(sub_questions, results):
        if result.abstained:
            parts.append(f"{sub_question}\n{build_abstain_message(sub_question, result.abstain_reason or 'low_confidence')}")
            continue
        if result.answer is None:
            parts.append(f"{sub_question}\nLLM not configured - showing retrieval only.")
            combined_chunks.extend(result.chunks)
            continue
        offset = len(combined_chunks)
        parts.append(f"{sub_question}\n{_renumber_citations(result.answer, offset)}")
        combined_chunks.extend(result.chunks)

    combined_answer = "\n\n".join(parts)

    if conversation_id is not None and conversation_store is not None:
        conversation_store.add_turn(conversation_id, "user", question)
        conversation_store.add_turn(
            conversation_id, "assistant", combined_answer, chunk_ids=[chunk.chunk_id for chunk in combined_chunks]
        )

    return AnswerResult(
        question=question,
        chunks=combined_chunks,
        confidence=max((result.confidence for result in results), default=0.0),
        abstained=False,
        abstain_reason=None,
        answer=combined_answer,
        sources=format_sources(combined_chunks, now=now) if combined_chunks else None,
        llm_configured=client is not None,
    )
