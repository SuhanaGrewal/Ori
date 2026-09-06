from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from meridian.query.anthropic_client import call_claude
from meridian.query.prompt import SPLIT_COMPOUND_SYSTEM_PROMPT
from meridian.redaction.tokenize import tokenize_for_external_call, untokenize
from meridian.security.audit_log import record_event


def maybe_split_compound_question(
    question: str,
    *,
    client: Any,
    model: str,
    analyzer: Any,
    logger: logging.Logger | None = None,
    audit_log_dir: Path | None = None,
) -> list[str] | None:
    """found live: a genuinely two-topic question (e.g. "whats my pan
    status and also whats the laptop drop off date") aborted retrieval
    entirely instead of answering either half - a single embedding/search
    pass over a two-topic question dilutes toward neither topic well
    enough to clear the confidence threshold, unlike either topic asked
    alone.

    Returns None when the question is not genuinely compound (including
    when no client is configured, matching this project's existing "no
    client, skip the extra LLM step" pattern elsewhere) - callers should
    proceed with the single-question pipeline exactly as before. Returns
    2+ self-contained sub-questions when it is, ordered as written.

    Same "ask a small model first" pattern already used by
    rewrite_followup_question - one cheap classification call, same cost
    profile, not a new mechanism."""
    if client is None:
        return None

    tokenization = tokenize_for_external_call(question, analyzer=analyzer, logger=logger)
    if audit_log_dir is not None:
        record_event(
            audit_log_dir, "llm.external_call",
            {"operation": "query.split_compound", "entity_counts": tokenization.entity_counts},
        )
    raw = call_claude(
        client, model=model, system=SPLIT_COMPOUND_SYSTEM_PROMPT, user_message=tokenization.tokenized_text,
        max_tokens=200, logger=logger,
    )
    response = untokenize(raw, tokenization.mapping)

    lines = [line.strip() for line in response.splitlines() if line.strip()]
    if any(line.upper() == "SINGLE" for line in lines):
        return None
    if len(lines) < 2:
        return None
    return lines
