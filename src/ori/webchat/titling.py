from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from ori.query.anthropic_client import call_claude
from ori.redaction.tokenize import tokenize_for_external_call, untokenize
from ori.security.audit_log import record_event

TITLE_SYSTEM_PROMPT = (
    "Generate a short title (4-6 words) for this question-and-answer "
    "exchange, the same way ChatGPT or Claude titles a new conversation - "
    "specific enough to recognize later in a list of many saved "
    "questions, not generic (\"Email Question\" is useless; \"Billy's "
    "Laptop Drop-off\" is useful). No quotes, no trailing punctuation, no "
    "markdown. Respond with ONLY the title, nothing else.\n\n"
    "Some names, email addresses, phone numbers, and addresses have been "
    "replaced with placeholders like <PERSON_1>, <EMAIL_ADDRESS_1>, "
    "<PHONE_NUMBER_1>, or <HOME_ADDRESS_1> to protect privacy. Treat these "
    "exactly like real names/emails/etc. when writing the title - use "
    "them naturally, and do not comment on or explain the placeholders "
    "themselves."
)


def generate_card_title(
    question: str,
    answer: str,
    *,
    client: Any,
    model: str,
    analyzer: Any,
    logger: logging.Logger | None = None,
    audit_log_dir: Path | None = None,
) -> str | None:
    """called once per brand-new top-level card (never for a nested
    follow-up - see webchat/server.py's generate_title flag, set by the
    frontend only when filing a new card via cardStore.fileNewQuestion,
    never for fileFollowUpOnCard) - matches the real ChatGPT/Claude
    behavior this was asked to mirror: one title generated from the
    conversation's opening exchange, not re-derived on every turn.
    Returns None (never raises) on any failure - the frontend already
    falls back to showing the raw question when no title comes back, so
    a titling hiccup should never block the actual answer from
    returning."""
    if client is None:
        return None
    try:
        user_message = f"Question: {question}\n\nAnswer: {answer}"
        tokenization = tokenize_for_external_call(user_message, analyzer=analyzer, logger=logger)
        if audit_log_dir is not None:
            record_event(
                audit_log_dir, "llm.external_call",
                {"operation": "webchat.title_card", "entity_counts": tokenization.entity_counts},
            )
        raw = call_claude(
            client, model=model, system=TITLE_SYSTEM_PROMPT, user_message=tokenization.tokenized_text,
            max_tokens=30, logger=logger,
        )
        title = untokenize(raw, tokenization.mapping).strip().strip('"').strip()
        return title or None
    except Exception:  # noqa: BLE001 - a titling failure must never break the actual answer
        if logger is not None:
            logger.warning("card title generation failed", extra={"operation": "webchat.title_card", "status": "error", "duration_ms": 0})
        return None
