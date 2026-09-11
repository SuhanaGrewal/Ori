from __future__ import annotations

from typing import Any

# maps a granted OAuth scope back to this project's internal source name.
# local_files has no OAuth scope at all and is never part of the webchat
# multi-user flow, so it's deliberately not in this mapping - revocation
# only ever applies to the three Google-backed sources a user can
# actually toggle in Settings.
SCOPE_TO_SOURCE = {
    "https://www.googleapis.com/auth/gmail.readonly": "gmail",
    "https://www.googleapis.com/auth/calendar.readonly": "calendar",
    "https://www.googleapis.com/auth/documents.readonly": "docs",
}


def revoked_sources(user: dict[str, Any]) -> frozenset[str]:
    """found via code inspection this session: revoking a scope in
    Settings only ever updated a display field - nothing in the query
    pipeline read it back to actually stop searching that source. This is
    the other half: which of gmail/calendar/docs is currently NOT
    granted, so callers can exclude it from both the main retrieval path
    and the router path. A small side-effect-free module (like
    webchat/citations.py before it) since webchat/server.py has expensive
    module-level side effects - real model loads on import - that make
    its own logic untestable directly."""
    granted = set(user.get("scopes") or [])
    return frozenset(source for scope, source in SCOPE_TO_SOURCE.items() if scope not in granted)
