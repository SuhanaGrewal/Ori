from __future__ import annotations

import json
import logging
from datetime import datetime
from email.utils import parseaddr
from typing import Any

from ori.digest.state import GatheredItem
from ori.inbox_intelligence.gmail_filters import NON_ACTIONABLE_CATEGORIES, looks_like_newsletter

_DETAIL_CHARS = 500


def _clean_sender_name(sender: str | None) -> str:
    """"Railway <hello@notify.railway.app>" -> "Railway" - the digest
    should read like a person telling you who emailed, not paste a raw
    From header. Falls back to the address's local-part (still better
    than the full address+domain) only when there's genuinely no display
    name to use."""
    display_name, email_addr = parseaddr(sender or "")
    if display_name:
        return display_name
    if email_addr:
        return email_addr.split("@")[0]
    return sender or "Unknown sender"


def _friendly_timestamp(iso_str: str | None) -> str:
    """"2026-09-11T23:15:00+00:00" -> "Thu 7:32 PM" - the digest (and the
    LLM summarizing it) should never have to work with raw ISO strings.
    Falls back to the raw string only if it genuinely isn't parseable,
    rather than silently dropping the timestamp entirely."""
    if not iso_str:
        return ""
    try:
        return datetime.fromisoformat(iso_str).strftime("%a %-I:%M %p")
    except ValueError:
        return iso_str


def _gmail_messages_for_digest(gmail_store: Any, since: str) -> tuple[list[Any], int]:
    """excludes promotional/social/updates/forums mail (gmail's own
    category labels) AND anything that looks like a newsletter by its own
    content (an unsubscribe link) even when Gmail's classifier left it in
    Primary - a personal-feeling Substack-style send from an individual's
    name is still a newsletter, not something waiting on a reply. A
    digest should reflect your primary inbox, not surface either kind.
    What's left is sorted so gmail's own IMPORTANT-labeled mail comes
    first - that's a real priority signal, not just "arrived most
    recently." The sort is stable, so chronological order is preserved
    within the important/not-important groups. Also returns how many
    messages were excluded, so the caller can still mention the total
    volume ("14 new emails, mostly newsletters") without spending context
    on their full bodies."""
    candidates = []
    excluded_count = 0
    for row in gmail_store.list_messages_since(since):
        labels = set(json.loads(row["label_ids"] or "[]"))
        if labels & NON_ACTIONABLE_CATEGORIES or looks_like_newsletter(row["body_text"]):
            excluded_count += 1
            continue
        candidates.append(("IMPORTANT" not in labels, row))
    candidates.sort(key=lambda pair: pair[0])
    return [row for _, row in candidates], excluded_count


def _gmail_item(row: Any) -> GatheredItem:
    sender_name = _clean_sender_name(row["sender"])
    return {
        "source": "gmail",
        "label": f"Email from {sender_name}: '{row['subject']}'",
        "detail": (row["body_text"] or "")[:_DETAIL_CHARS],
    }


def _calendar_item(row: Any) -> GatheredItem:
    return {
        "source": "calendar",
        "label": f"Calendar event '{row['summary']}' starting {_friendly_timestamp(row['start_at'])}",
        "detail": (row["description"] or "")[:_DETAIL_CHARS],
    }


def _docs_item(row: Any) -> GatheredItem:
    return {
        "source": "docs",
        "label": f"Google Doc titled '{row['title']}', modified {_friendly_timestamp(row['modified_time'])}",
        "detail": (row["content_text"] or "")[:_DETAIL_CHARS],
    }


def _notes_item(row: Any) -> GatheredItem:
    return {
        "source": "local_files",
        "label": f"Note file at {row['path']}, updated {_friendly_timestamp(row['updated_at'])}",
        "detail": (row["content_text"] or "")[:_DETAIL_CHARS],
    }


def _entity_item(row: Any) -> GatheredItem:
    return {
        "source": "entity",
        "label": f"{row['display_name']} ({row['entity_type']}) mentioned {row['mention_count']} time(s)",
        "detail": "",
    }


def _excluded_gmail_summary_item(excluded_count: int) -> GatheredItem:
    return {
        "source": "gmail",
        "label": (
            f"{excluded_count} additional email(s) arrived in Promotions/Social/Updates/Forums "
            "- filtered from the primary inbox, not detailed individually"
        ),
        "detail": "",
    }


def open_question_item(open_question: dict) -> GatheredItem:
    """a still-unresolved "waiting on something" question the user asked
    previously (see query/history.py::check_open_questions) - distinct
    from every other item here, which describes new/changed source
    content. Labeled explicitly as a follow-up so the digest prompt's
    existing "call it out plainly" instruction has something unambiguous
    to grab onto, rather than this blending into routine noise."""
    return {
        "source": "query_history",
        "label": (
            f"Follow-up you're still waiting on (asked {open_question['asked_at']}): "
            f"\"{open_question['question_text']}\""
        ),
        "detail": "Still no confident answer found for this as of this digest.",
    }


def gather_items(
    gmail_store: Any,
    calendar_store: Any,
    docs_store: Any,
    notes_store: Any,
    entity_store: Any,
    *,
    since: str,
    now: str,
    lookahead_end: str,
    logger: logging.Logger | None = None,
) -> list[GatheredItem]:
    """pulls raw new/changed/upcoming content directly from each source's
    own store - no search, embeddings, or reranking involved. gmail/docs/
    notes/entities are backward-looking (what changed since `since`);
    calendar is forward-looking (what's upcoming between `now` and
    `lookahead_end`), since that's what's actually useful in a personal
    digest."""
    gmail_messages, excluded_gmail_count = _gmail_messages_for_digest(gmail_store, since)

    items: list[GatheredItem] = []
    items += [_gmail_item(row) for row in gmail_messages]
    if excluded_gmail_count > 0:
        items.append(_excluded_gmail_summary_item(excluded_gmail_count))
    items += [_calendar_item(row) for row in calendar_store.list_events_upcoming(now, lookahead_end)]
    items += [_docs_item(row) for row in docs_store.list_docs_modified_since(since)]
    items += [_notes_item(row) for row in notes_store.list_notes_updated_since(since)]
    items += [_entity_item(row) for row in entity_store.list_entities_mentioned_since(since)]

    if logger is not None:
        logger.info(
            "digest gather complete",
            extra={
                "operation": "digest.gather",
                "status": "success",
                "duration_ms": 0,
                "item_count": len(items),
            },
        )
    return items
