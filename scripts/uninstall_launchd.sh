#!/bin/bash
# Removes the launchd agents installed by install_launchd.sh (including
# the older gmail-only job name, if present from before autosync covered
# every source).
set -euo pipefail

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

launchctl unload "$LAUNCH_AGENTS_DIR/com.ori.gmailsync.plist" 2>/dev/null || true
launchctl unload "$LAUNCH_AGENTS_DIR/com.ori.autosync.plist" 2>/dev/null || true
launchctl unload "$LAUNCH_AGENTS_DIR/com.ori.nightlydigest.plist" 2>/dev/null || true
launchctl unload "$LAUNCH_AGENTS_DIR/com.ori.calendarnotify.plist" 2>/dev/null || true

rm -f "$LAUNCH_AGENTS_DIR/com.ori.gmailsync.plist" \
      "$LAUNCH_AGENTS_DIR/com.ori.autosync.plist" \
      "$LAUNCH_AGENTS_DIR/com.ori.nightlydigest.plist" \
      "$LAUNCH_AGENTS_DIR/com.ori.calendarnotify.plist"

echo "Removed Ori's scheduled sync, nightly digest, and calendar-notification jobs."
