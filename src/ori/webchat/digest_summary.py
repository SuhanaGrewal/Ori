from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ori.digest.gather import gather_items
from ori.inbox_intelligence.stale_threads import find_stale_threads
from ori.query.anthropic_client import call_claude
from ori.redaction.tokenize import tokenize_for_external_call, untokenize
from ori.security.audit_log import record_event

_LOOKBACK_HOURS = 24
_LOOKAHEAD_DAYS = 3
_MAX_SUMMARY_TOKENS = 300
# "trailing follow-ups" is open-ended, not windowed by since/until (a
# thread you never replied to matters whether it went quiet yesterday or
# three weeks ago) - this only bounds it against surfacing a mailbox's
# entire multi-year history, matching query/router.py's own default for
# the same reason.
_DEFAULT_MAX_DAYS_QUIET = 30

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

SUMMARIZE_ACTIONABLE_ITEMS_SYSTEM_PROMPT = (
    "Extract concrete, actionable next steps the user could take, from "
    "the numbered items below. Each phrase should be a short, direct "
    "action (e.g. 'Reply to Jordan about the budget', 'Pay invoice #4471 "
    "by Friday'), suitable for a compact to-do list, not a report - no "
    "bracket citations, no markdown, no more than about 12 words each. "
    "Skip items with nothing actionable (newsletters, FYI-only emails, "
    "routine calendar events) entirely rather than forcing an action onto "
    "them. If there is truly nothing actionable, respond with exactly: "
    "Nothing actionable right now. Respond with ONLY the phrases, one per "
    "line, nothing else - no numbering, no introduction.\n\n"
    "Some names, email addresses, phone numbers, and addresses have been "
    "replaced with placeholders like <PERSON_1>, <EMAIL_ADDRESS_1>, "
    "<PHONE_NUMBER_1>, or <HOME_ADDRESS_1> to protect privacy. Treat these "
    "exactly like real names/emails/etc. - use them naturally, and do not "
    "comment on or explain the placeholders themselves."
)

SUMMARIZE_TRAILING_FOLLOWUPS_SYSTEM_PROMPT = (
    "Write one or two short, conversational sentences summarizing "
    "everything below that's still trailing on the user - threads they "
    "haven't replied to, and things other people still owe them. Write "
    "like a sharp personal assistant giving a casual heads-up out loud, "
    "not a report: natural and a little informal, using the real names "
    "and actual specifics given (who, what, how long it's been quiet) "
    "rather than vague descriptions. Combine multiple items into flowing "
    "sentences joined naturally with commas and \"and\" - never bullets, "
    "never numbers, never markdown, no bracket citations. If there is "
    "truly nothing trailing, respond with exactly: You're caught up - "
    "nothing trailing right now. Respond with ONLY the sentence(s), "
    "nothing else - no introduction.\n\n"
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


def _summarize_items(
    items: list[Any],
    system_prompt: str,
    empty_prefix: str,
    *,
    client: Any,
    model: str,
    analyzer: Any,
    logger: logging.Logger | None,
    audit_log_dir: Path | None,
    operation: str,
) -> list[str]:
    """shared by "new so far" and "things to do" - same gathered items,
    same tokenize/call/untokenize/parse-lines shape, only the system
    prompt (and what counts as "nothing to report") differs."""
    if not items or client is None:
        return []

    user_message = _build_user_message(items)
    tokenization = tokenize_for_external_call(user_message, analyzer=analyzer, logger=logger)
    if audit_log_dir is not None:
        record_event(
            audit_log_dir, "llm.external_call",
            {"operation": operation, "entity_counts": tokenization.entity_counts},
        )
    raw = call_claude(
        client, model=model, system=system_prompt, user_message=tokenization.tokenized_text,
        max_tokens=_MAX_SUMMARY_TOKENS, logger=logger,
    )
    text = untokenize(raw, tokenization.mapping)

    lines = [line.strip("-• \t") for line in text.splitlines() if line.strip()]
    if len(lines) == 1 and lines[0].lower().startswith(empty_prefix):
        return []
    return lines


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
    excluded_sources: frozenset[str] | None = None,
) -> list[str]:
    """kept for any caller still wanting just the flat "what's new" bullet
    list - build_morning_digest below is the webchat digest popup's
    actual endpoint now, this is one piece of it factored back out."""
    now = now if now is not None else datetime.now(tz=timezone.utc)
    since = now - timedelta(hours=_LOOKBACK_HOURS)
    lookahead_end = now + timedelta(days=_LOOKAHEAD_DAYS)

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=since.isoformat(), now=now.isoformat(), lookahead_end=lookahead_end.isoformat(), logger=logger,
    )
    if excluded_sources:
        items = [item for item in items if item["source"] not in excluded_sources]

    return _summarize_items(
        items, SUMMARIZE_DIGEST_ITEMS_SYSTEM_PROMPT, "nothing new",
        client=client, model=model, analyzer=analyzer, logger=logger, audit_log_dir=audit_log_dir,
        operation="webchat.digest_summary",
    )


def _build_trailing_message(stale_threads: list[Any], commitments: list[Any]) -> str:
    lines = ["Threads the user hasn't replied to:"]
    for thread in stale_threads:
        lines.append(f"- From {thread.last_sender}, subject \"{thread.subject}\", quiet {thread.days_quiet} day(s)")
    lines.append("")
    lines.append("Things other people still owe the user, or the user owes someone else:")
    for row in commitments:
        who = "the user" if row["made_by"] == "me" else row["other_party"]
        due = f", due {row['due_date']}" if row["due_date"] else ""
        lines.append(f"- {who}: {row['description']}{due}")
    return "\n".join(lines).strip()


def _summarize_trailing(
    stale_threads: list[Any],
    commitments: list[Any],
    *,
    client: Any,
    model: str,
    analyzer: Any,
    logger: logging.Logger | None,
    audit_log_dir: Path | None,
) -> str:
    """one flowing, conversational blurb - not a raw list of sender/
    subject/quiet-days fields - see the real example this was built
    against (a personal-assistant voice, specific and a little informal,
    e.g. "Billy needs a day and time for the laptop... Dr. Ahuja hasn't
    replied about the immunization record"). Falls back to a plain,
    still-readable join of the raw facts (not the LLM's voice, but not
    nothing) when no LLM is configured, rather than an empty section."""
    if not stale_threads and not commitments:
        return "You're caught up — nothing trailing right now."

    if client is None:
        parts = [f'{thread.last_sender} on "{thread.subject}" (quiet {thread.days_quiet}d)' for thread in stale_threads]
        parts += [
            f"{'You' if row['made_by'] == 'me' else row['other_party']}: {row['description']}"
            for row in commitments
        ]
        return "Still open: " + "; ".join(parts)

    user_message = _build_trailing_message(stale_threads, commitments)
    tokenization = tokenize_for_external_call(user_message, analyzer=analyzer, logger=logger)
    if audit_log_dir is not None:
        record_event(
            audit_log_dir, "llm.external_call",
            {"operation": "webchat.digest_trailing", "entity_counts": tokenization.entity_counts},
        )
    raw = call_claude(
        client, model=model, system=SUMMARIZE_TRAILING_FOLLOWUPS_SYSTEM_PROMPT, user_message=tokenization.tokenized_text,
        max_tokens=220, logger=logger,
    )
    return untokenize(raw, tokenization.mapping).strip()


def build_morning_digest(
    gmail_store: Any,
    calendar_store: Any,
    docs_store: Any,
    notes_store: Any,
    entity_store: Any,
    inbox_store: Any,
    account_email: str | None,
    *,
    client: Any,
    model: str,
    analyzer: Any,
    now: datetime | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    logger: logging.Logger | None = None,
    audit_log_dir: Path | None = None,
    excluded_sources: frozenset[str] | None = None,
) -> dict[str, Any]:
    """the webchat digest popup's real shape: a short "new so far"
    highlight reel, the raw events the window actually gathered ("events
    from last evening/night"), actionable next steps pulled from those
    same events ("things to do"), and open-ended trailing follow-ups that
    were never time-windowed to begin with. `since`/`until` let a caller
    (the frontend's own time-range picker) override the default 24h
    lookback ending now - both default independently so a caller can
    override just one side (e.g. "since 6pm yesterday" with `until`
    still defaulting to now).

    trailingFollowUps reuses find_stale_threads() and
    inbox_store.list_open_commitments() wholesale rather than
    reimplementing "what hasn't been followed up on" - both already exist
    for exactly this (see query/router.py's stale_threads/commitments
    intents) and are open-ended by nature, not scoped to this digest's
    since/until window at all."""
    now = now if now is not None else datetime.now(tz=timezone.utc)
    until = until if until is not None else now
    since = since if since is not None else until - timedelta(hours=_LOOKBACK_HOURS)
    lookahead_end = now + timedelta(days=_LOOKAHEAD_DAYS)

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=since.isoformat(), now=until.isoformat(), lookahead_end=lookahead_end.isoformat(), logger=logger,
    )
    if excluded_sources:
        items = [item for item in items if item["source"] not in excluded_sources]

    new_so_far = _summarize_items(
        items, SUMMARIZE_DIGEST_ITEMS_SYSTEM_PROMPT, "nothing new",
        client=client, model=model, analyzer=analyzer, logger=logger, audit_log_dir=audit_log_dir,
        operation="webchat.digest_new_so_far",
    )
    things_to_do = _summarize_items(
        items, SUMMARIZE_ACTIONABLE_ITEMS_SYSTEM_PROMPT, "nothing actionable",
        client=client, model=model, analyzer=analyzer, logger=logger, audit_log_dir=audit_log_dir,
        operation="webchat.digest_things_to_do",
    )
    events = [{"label": item["label"], "detail": item.get("detail", ""), "source": item["source"]} for item in items]

    stale_threads = (
        find_stale_threads(
            gmail_store, account_email, now=now, max_days_quiet=_DEFAULT_MAX_DAYS_QUIET,
            exclude_thread_ids=inbox_store.list_dismissed_thread_ids(),
        )
        if account_email else []
    )
    trailing_summary = _summarize_trailing(
        stale_threads, inbox_store.list_open_commitments(),
        client=client, model=model, analyzer=analyzer, logger=logger, audit_log_dir=audit_log_dir,
    )

    return {
        "windowStart": since.isoformat(),
        "windowEnd": until.isoformat(),
        "newSoFar": new_so_far,
        "events": events,
        "thingsToDo": things_to_do,
        "trailingFollowUps": trailing_summary,
    }
