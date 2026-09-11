from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from googleapiclient.errors import HttpError

from ori.common.google_api import execute_with_retry
from ori.common.rate_limiter import TokenBucket
from ori.common.retry import RetryExhaustedError
from ori.ingestion.gmail.attachment_parser import extract_attachment_text
from ori.ingestion.gmail.message_parser import (
    MessageParseError,
    decode_base64url_bytes,
    list_attachment_refs,
    parse_message,
)
from ori.ingestion.gmail.store import GmailStore

_HISTORY_TYPES = ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]


@dataclass
class SyncStats:
    sync_type: str
    messages_fetched: int = 0
    messages_updated: int = 0
    messages_deleted: int = 0
    parse_failures: int = 0
    fetch_failures: int = 0
    duration_ms: float = 0.0


class _HistoryExpired(Exception):
    pass


def run_sync(
    service,
    store: GmailStore,
    *,
    rate_limiter: TokenBucket | None = None,
    logger: logging.Logger | None = None,
    query: str = "",
) -> SyncStats:
    start = time.monotonic()
    sync_state = store.get_sync_state()

    if store.get_account_email() is None:
        _capture_account_email(service, store, rate_limiter=rate_limiter, logger=logger)

    if sync_state.last_history_id is None:
        stats = _full_backfill(service, store, rate_limiter=rate_limiter, logger=logger, query=query)
    else:
        try:
            stats = _incremental_sync(
                service,
                store,
                rate_limiter=rate_limiter,
                logger=logger,
                last_history_id=sync_state.last_history_id,
            )
        except _HistoryExpired:
            if logger is not None:
                logger.warning(
                    "gmail history id expired, falling back to full resync",
                    extra={"operation": "gmail.sync", "status": "retry", "duration_ms": 0},
                )
            stats = _full_backfill(service, store, rate_limiter=rate_limiter, logger=logger, query=query)

    stats.duration_ms = round((time.monotonic() - start) * 1000, 2)

    if logger is not None:
        logger.info(
            f"gmail sync complete ({stats.sync_type})",
            extra={
                "operation": "gmail.sync",
                "status": "success",
                "duration_ms": stats.duration_ms,
                "sync_type": stats.sync_type,
                "messages_fetched": stats.messages_fetched,
                "messages_updated": stats.messages_updated,
                "messages_deleted": stats.messages_deleted,
                "parse_failures": stats.parse_failures,
                "fetch_failures": stats.fetch_failures,
            },
        )

    return stats


def _capture_account_email(service, store, *, rate_limiter, logger) -> None:
    """one-time, self-healing: runs on whichever sync (full or
    incremental) first notices account_email hasn't been captured yet -
    covers both a brand-new database and an existing one from before this
    field existed, without requiring a disruptive --full-resync."""
    profile = execute_with_retry(
        service.users().getProfile(userId="me"),
        rate_limiter=rate_limiter,
        logger=logger,
        operation="gmail.get_profile",
    )
    store.set_account_email(profile["emailAddress"])


def _full_backfill(service, store, *, rate_limiter, logger, query: str) -> SyncStats:
    stats = SyncStats(sync_type="full")

    profile = execute_with_retry(
        service.users().getProfile(userId="me"),
        rate_limiter=rate_limiter,
        logger=logger,
        operation="gmail.get_profile",
    )
    starting_history_id = profile["historyId"]

    page_token = None
    while True:
        response = execute_with_retry(
            service.users().messages().list(userId="me", q=query, pageToken=page_token, maxResults=100),
            rate_limiter=rate_limiter,
            logger=logger,
            operation="gmail.messages_list",
        )
        for item in response.get("messages", []):
            _fetch_and_store(service, store, item["id"], stats, rate_limiter=rate_limiter, logger=logger)

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    store.set_sync_state(starting_history_id)
    return stats


def _incremental_sync(service, store, *, rate_limiter, logger, last_history_id: str) -> SyncStats:
    stats = SyncStats(sync_type="incremental")

    page_token = None
    latest_history_id = last_history_id
    while True:
        request = service.users().history().list(
            userId="me",
            startHistoryId=last_history_id,
            historyTypes=_HISTORY_TYPES,
            pageToken=page_token,
        )
        try:
            response = execute_with_retry(
                request,
                rate_limiter=rate_limiter,
                logger=logger,
                operation="gmail.history_list",
            )
        except HttpError as exc:
            if getattr(exc.resp, "status", None) == 404:
                raise _HistoryExpired() from exc
            raise

        for record in response.get("history", []):
            for added in record.get("messagesAdded", []):
                message_id = added["message"]["id"]
                _fetch_and_store(service, store, message_id, stats, rate_limiter=rate_limiter, logger=logger)

            for changed in record.get("labelsAdded", []) + record.get("labelsRemoved", []):
                message = changed["message"]
                store.update_labels(message["id"], message.get("labelIds", []))
                stats.messages_updated += 1

            for deleted in record.get("messagesDeleted", []):
                store.mark_deleted(deleted["message"]["id"])
                stats.messages_deleted += 1

        latest_history_id = response.get("historyId", latest_history_id)
        page_token = response.get("nextPageToken")
        if not page_token:
            break

    store.set_sync_state(latest_history_id)
    return stats


def _fetch_and_store(service, store, message_id: str, stats: SyncStats, *, rate_limiter, logger) -> None:
    try:
        raw = execute_with_retry(
            service.users().messages().get(userId="me", id=message_id, format="full"),
            rate_limiter=rate_limiter,
            logger=logger,
            operation="gmail.messages_get",
        )
    except HttpError as exc:
        if getattr(exc.resp, "status", None) == 404:
            # message was deleted between the history event and our fetch —
            # a benign race, not a parse failure.
            store.mark_deleted(message_id)
            stats.messages_deleted += 1
            return
        raise
    except RetryExhaustedError as exc:
        # execute_with_retry only reaches here for an error it already
        # classified as transient (429/quota-flavored 403/5xx/connection
        # failure - see google_api.py) that still never recovered within
        # the retry budget. Real quota exhaustion on a big first-time
        # backfill can outlast a handful of retries for one message
        # without meaning every later message is doomed too - dead-letter
        # just this one and keep going, the same way a parse failure below
        # doesn't abort the whole mailbox. A genuinely permanent error
        # (401/403-non-quota/400) never raises RetryExhaustedError at all -
        # execute_with_retry re-raises those immediately with zero
        # retries - so it still propagates and aborts the sync here,
        # unchanged (see
        # test_permanent_error_during_fetch_propagates_without_retrying_forever).
        store.record_dead_letter(message_id, str(exc))
        stats.fetch_failures += 1
        if logger is not None:
            logger.warning(
                f"gave up fetching gmail message {message_id} after exhausting retries",
                extra={"operation": "gmail.fetch_exhausted", "status": "error", "duration_ms": 0},
            )
        return

    # raw.get, not raw["payload"] - a malformed message missing this
    # field entirely must still reach parse_message() below, which is
    # what actually classifies "missing required field" as a dead-lettered
    # parse failure rather than crashing the whole sync batch on it.
    attachment_texts = _fetch_attachment_texts(
        service, message_id, raw.get("payload", {}), rate_limiter=rate_limiter, logger=logger
    )

    try:
        parsed = parse_message(raw, attachment_texts=attachment_texts)
    except MessageParseError as exc:
        store.record_dead_letter(message_id, str(exc))
        stats.parse_failures += 1
        if logger is not None:
            logger.warning(
                f"failed to parse gmail message {message_id}",
                extra={"operation": "gmail.parse_message", "status": "error", "duration_ms": 0},
            )
        return

    store.upsert_message(parsed)
    stats.messages_fetched += 1


def _fetch_attachment_texts(service, message_id, payload, *, rate_limiter, logger) -> list[str]:
    """fetches and extracts text for every attachment on one message.
    Each attachment is its own API call (messages.attachments.get) and
    its own failure domain - one attachment that's unreachable (deleted,
    quota-exhausted mid-loop) or unparseable is dead-lettered as a
    warning and skipped, the same "don't lose everything else over one
    bad item" spirit as _fetch_and_store's own message-level handling,
    just one level down. Returns plain text ready to hand to
    parse_message(), never raises."""
    texts: list[str] = []
    for ref in list_attachment_refs(payload):
        try:
            attachment = execute_with_retry(
                service.users().messages().attachments().get(
                    userId="me", messageId=message_id, id=ref.attachment_id
                ),
                rate_limiter=rate_limiter,
                logger=logger,
                operation="gmail.attachments_get",
            )
        except (HttpError, RetryExhaustedError):
            if logger is not None:
                logger.warning(
                    f"failed to fetch attachment {ref.filename!r} on message {message_id}",
                    extra={"operation": "gmail.attachment_fetch", "status": "error", "duration_ms": 0},
                )
            continue

        data = decode_base64url_bytes(attachment.get("data", ""))
        text = extract_attachment_text(ref.filename, ref.mime_type, data, logger=logger)
        if text.strip():
            texts.append(f"[Attachment: {ref.filename}]\n{text}")

    return texts
