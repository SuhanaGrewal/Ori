from __future__ import annotations

import argparse
import os

from ori.common.config import ensure_dirs, load_config
from ori.common.logging import get_logger
from ori.common.rate_limiter import TokenBucket
from ori.ingestion.calendar.client import build_calendar_service
from ori.ingestion.calendar.store import CalendarStore
from ori.ingestion.calendar.sync import run_sync

_CALENDAR_ID = "primary"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync Google Calendar events into Ori's local store (readonly)."
    )
    parser.add_argument(
        "--full-resync",
        action="store_true",
        help="Ignore any stored sync token and re-run a full backfill from scratch.",
    )
    args = parser.parse_args()

    config = load_config()
    ensure_dirs(config)
    logger = get_logger("ori.ingestion.calendar.cli", log_dir=config.log_dir)

    store = CalendarStore(config.ingestion_dir / "calendar" / "calendar.db")
    if args.full_resync:
        store.clear_sync_state(_CALENDAR_ID)

    service = build_calendar_service(config=config)
    rate_limiter = TokenBucket(rate=3, capacity=6)
    time_min = os.environ.get("CALENDAR_SYNC_TIME_MIN") or None

    stats = run_sync(
        service,
        store,
        calendar_id=_CALENDAR_ID,
        rate_limiter=rate_limiter,
        logger=logger,
        time_min=time_min,
    )

    print(
        f"Calendar sync complete ({stats.sync_type}): "
        f"{stats.events_fetched} fetched, {stats.events_deleted} deleted, "
        f"{stats.events_reconciled_deleted} reconciled-deleted, "
        f"{stats.parse_failures} parse failures in {stats.duration_ms:.0f}ms."
    )


if __name__ == "__main__":
    main()
