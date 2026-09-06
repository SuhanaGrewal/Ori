from __future__ import annotations

import logging
from typing import Any

from meridian.auth.credentials import get_credentials
from meridian.common.config import Config, config_for_user, ensure_dirs
from meridian.common.rate_limiter import TokenBucket
from meridian.indexing.orchestrator import run_indexing
from meridian.indexing.store import IndexStore
from meridian.ingestion.calendar.client import build_calendar_service
from meridian.ingestion.calendar.store import CalendarStore
from meridian.ingestion.calendar.sync import run_sync as run_calendar_sync
from meridian.ingestion.docs.client import build_docs_service, build_drive_service
from meridian.ingestion.docs.store import DocsStore
from meridian.ingestion.docs.sync import run_sync as run_docs_sync
from meridian.ingestion.gmail.client import build_gmail_service
from meridian.ingestion.gmail.store import GmailStore
from meridian.ingestion.gmail.sync import run_sync as run_gmail_sync
from meridian.webchat.users_store import WebUsersStore

_CALENDAR_ID = "primary"


def run_initial_sync(
    user_id: str, *, config: Config, users: WebUsersStore, embedder: Any, logger: logging.Logger
) -> None:
    """runs once, as a FastAPI background task right after a user
    completes real Google OAuth consent (see server.py's google_callback).
    Without this, a freshly-registered webchat user's per-user index stays
    permanently empty - nothing was ever ingested for them - so every
    question would abstain with "no_candidates" forever, no matter how
    good retrieval/reranking/conversation history are. This mirrors
    exactly what a human operator would otherwise run by hand (`python -m
    meridian.ingestion.gmail`, etc.) against the single-user config, just
    aimed at this one user's config_for_user() data_dir and triggered
    automatically instead of manually.

    Each source's sync is independently try/excepted: one source failing
    (e.g. the Docs API not being enabled for this Google account) must
    not block the others or leave the user stuck in "syncing" forever -
    same log-and-skip, never-crash-the-run principle every other ingestion
    phase in this project already follows."""
    per_user_config = config_for_user(config, user_id)
    ensure_dirs(per_user_config)
    users.set_sync_status(user_id, "syncing")
    users.add_audit_event(user_id, "sync_started", "Started syncing Gmail, Calendar, and Docs")

    try:
        credentials = get_credentials(config=per_user_config, interactive=False)
    except Exception:
        logger.exception("webchat.initial_sync: could not load credentials for %s", user_id)
        users.set_sync_status(user_id, "error")
        users.add_audit_event(user_id, "sync_error", "Could not load Google credentials")
        return

    try:
        gmail_store = GmailStore(per_user_config.ingestion_dir / "gmail" / "gmail.db")
        run_gmail_sync(
            build_gmail_service(credentials=credentials),
            gmail_store,
            rate_limiter=TokenBucket(rate=5, capacity=10),
            logger=logger,
        )
    except Exception:
        logger.exception("webchat.initial_sync: gmail sync failed for %s", user_id)

    try:
        calendar_store = CalendarStore(per_user_config.ingestion_dir / "calendar" / "calendar.db")
        run_calendar_sync(
            build_calendar_service(credentials=credentials),
            calendar_store,
            calendar_id=_CALENDAR_ID,
            rate_limiter=TokenBucket(rate=3, capacity=6),
            logger=logger,
        )
    except Exception:
        logger.exception("webchat.initial_sync: calendar sync failed for %s", user_id)

    try:
        docs_store = DocsStore(per_user_config.ingestion_dir / "docs" / "docs.db")
        run_docs_sync(
            build_drive_service(credentials=credentials),
            build_docs_service(credentials=credentials),
            docs_store,
            rate_limiter=TokenBucket(rate=5, capacity=10),
            logger=logger,
        )
    except Exception:
        logger.exception("webchat.initial_sync: docs sync failed for %s", user_id)

    try:
        index_store = IndexStore(per_user_config.indexing_dir / "index.db")
        run_indexing(per_user_config.ingestion_dir, index_store, embedder, logger=logger)
    except Exception:
        logger.exception("webchat.initial_sync: indexing failed for %s", user_id)
        users.set_sync_status(user_id, "error")
        users.add_audit_event(user_id, "sync_error", "Indexing failed after ingestion")
        return

    users.set_sync_status(user_id, "complete")
    users.add_audit_event(user_id, "sync_complete", "Initial Gmail/Calendar/Docs sync and indexing finished")
