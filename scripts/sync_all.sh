#!/bin/bash
# Wrapper invoked by the com.ori.autosync launchd job every 10
# minutes. Runs incremental sync for every source (Gmail, Calendar, Docs,
# local files), then reindexes everything - incremental, so this is cheap
# when little has actually changed.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
PYTHON="$PROJECT_DIR/.venv/bin/python"

"$PYTHON" -m ori.ingestion.gmail
"$PYTHON" -m ori.ingestion.calendar
"$PYTHON" -m ori.ingestion.docs

# local_files exits 1 (by design, not a crash) when ORI_NOTES_FOLDER
# isn't configured - under `set -e` that would otherwise kill this whole
# script and skip indexing entirely. Only run it when the folder is
# actually configured, same check the command itself makes.
if grep -qE '^ORI_NOTES_FOLDER=.+' "$PROJECT_DIR/.env" 2>/dev/null; then
    "$PYTHON" -m ori.ingestion.local_files
fi

"$PYTHON" -m ori.indexing
