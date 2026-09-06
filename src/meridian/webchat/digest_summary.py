from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from meridian.digest.gather import gather_items
from meridian.query.anthropic_client import call_claude
from meridian.redaction.tokenize import tokenize_for_external_call, untokenize
from meridian.security.audit_log import record_event

_LOOKBACK_HOURS = 24
_LOOKAHEAD_DAYS = 3
_MAX_SUMMARY_TOKENS = 300

SUMMARIZE_DIGEST_ITEMS_SYSTEM_PROMPT = (
    "Summarize the numbered items below into 3-5 short, plain-language "
    "bullet phrases suitable for a compact notification popup, not a "
    "report - each phrase a single short sentence fragment, no bracket "
    "citations, no markdown, no more than about 12 words each. Pick only "
    "the items actually worth surfacing; skip routine noise entirely "
    "rather than forcing every item into a phrase. If there is truly "
    "nothing worth mentioning, respond with exactly: Nothing new to "
    "report. Respond with ONLY the phrases, one per line, nothing else - "
    "no numbering, no introduction.\n\n"
    "Some names, email addresses, phone numbers, and addresses have been "
    "replaced with placeholders like <PERSON_1>, <EMAIL_ADDRESS_1>, "
    "<PHONE_NUMBER_1>, or <HOME_ADDRESS_1> to protect privacy. Treat these "
    "exactly like real names/emails/etc. - use them naturally, and do not "
    "comment on or explain the placeholders themselves."
)


def _build_user_message(items: list[Any]) -> str:
    lines = ["Items:"]
    for index, item in enumerate(items, start=1):
        lines.append(f"[{index}] {item['label']}")
        if item["detail"]:
            lines.append(item["detail"])
        lines.append("")
    return "\n".join(lines).strip()


def build_digest_items(
    gmail_store: Any,
    calendar_store: Any,
    docs_store: Any,
    notes_store: Any,
    entity_store: Any,
    *,
    client: Any,
    model: str,
    analyzer: Any,
    now: datetime | None = None,
    logger: logging.Logger | None = None,
    audit_log_dir: Path | None = None,
) -> list[str]:
    """a short, notification-shaped digest (3-5 bullet phrases) for the
    webchat's "tonight's digest" popup - distinct from
    digest/orchestrator.py's full approval-gated workflow, which produces
    a longer narrative digest and requires an explicit approve/reject
    step before being considered final (genuinely different from what a
    quick popup needs). Reuses gather_items() wholesale rather than
    reimplementing "what's new," same reuse this project already applies
    in query/router.py's broad-summary intent - the only new piece here
    is summarizing into a much shorter form. Returns an empty list (no
    LLM call) when there's nothing gathered, or no client configured."""
    now = now if now is not None else datetime.now(tz=timezone.utc)
    since = now - timedelta(hours=_LOOKBACK_HOURS)
    lookahead_end = now + timedelta(days=_LOOKAHEAD_DAYS)

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=since.isoformat(), now=now.isoformat(), lookahead_end=lookahead_end.isoformat(), logger=logger,
    )
    if not items or client is None:
        return []

    user_message = _build_user_message(items)
    tokenization = tokenize_for_external_call(user_message, analyzer=analyzer, logger=logger)
    if audit_log_dir is not None:
        record_event(
            audit_log_dir, "llm.external_call",
            {"operation": "webchat.digest_summary", "entity_counts": tokenization.entity_counts},
        )
    raw = call_claude(
        client, model=model, system=SUMMARIZE_DIGEST_ITEMS_SYSTEM_PROMPT, user_message=tokenization.tokenized_text,
        max_tokens=_MAX_SUMMARY_TOKENS, logger=logger,
    )
    text = untokenize(raw, tokenization.mapping)

    lines = [line.strip("-• \t") for line in text.splitlines() if line.strip()]
    if len(lines) == 1 and lines[0].lower().startswith("nothing new"):
        return []
    return lines
