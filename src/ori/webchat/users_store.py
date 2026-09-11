from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id      TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    dob          TEXT,
    email        TEXT,
    scopes_json  TEXT NOT NULL DEFAULT '[]',
    connected_at TEXT,
    created_at   TEXT NOT NULL,
    sync_status  TEXT NOT NULL DEFAULT 'not_started'
);

CREATE TABLE IF NOT EXISTS sessions (
    session_token TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
    event_id TEXT PRIMARY KEY,
    user_id  TEXT NOT NULL,
    type     TEXT NOT NULL,
    detail   TEXT NOT NULL,
    at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id, at DESC);
"""


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class WebUsersStore:
    """the multi-user account registry for the webchat backend - a
    genuinely new concept for this project (every other store in this
    codebase is single-user, scoped by config.data_dir alone). This store
    itself stays global (one users.db, not per-user - it's the directory
    that maps a user_id to a profile and resolves which per-user
    config_for_user() data_dir to use), while every other store a logged-
    in user's requests touch (gmail, calendar, entity_graph, etc.) is
    still the existing single-user store, just rooted under that user's
    own data_dir. Matches the frontend's mockAuth.js contract shape
    exactly (id/name/dob/email/scopes/connectedAt/auditLog) so the API
    layer can return get_user_profile() almost verbatim."""

    def __init__(self, db_path: Path):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # check_same_thread=False: this store is built once at server
        # startup and shared across every request, but FastAPI's sync
        # endpoints each run in a threadpool worker thread, not the
        # startup thread - the same real constraint the LangGraph
        # checkpointer already works around in digest/__main__.py. SQLite's
        # own file-level locking plus the GIL make this safe enough at
        # personal-tool request volumes; it would not be for a real
        # concurrent-write workload.
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        try:
            # CREATE TABLE IF NOT EXISTS never adds a column to a table
            # that already existed on disk before this field was added -
            # this migrates any pre-existing users.db in place. Fresh
            # databases already have the column from _SCHEMA above, so
            # this raises "duplicate column" there and is ignored.
            self._conn.execute("ALTER TABLE users ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'not_started'")
        except sqlite3.OperationalError:
            pass
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def create_user(self, name: str, dob: str | None) -> str:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        now = _now()
        with self._conn:
            self._conn.execute(
                "INSERT INTO users (user_id, name, dob, email, scopes_json, connected_at, created_at) "
                "VALUES (?, ?, ?, NULL, '[]', NULL, ?)",
                (user_id, name, dob, now),
            )
        self.add_audit_event(user_id, "account_created", f"Profile created for {name}")
        return user_id

    def get_user_profile(self, user_id: str) -> dict[str, Any] | None:
        row = self._conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        if row is None:
            return None
        return {
            "id": row["user_id"],
            "name": row["name"],
            "dob": row["dob"],
            "email": row["email"],
            "scopes": json.loads(row["scopes_json"]),
            "connectedAt": row["connected_at"],
            "syncStatus": row["sync_status"],
            "auditLog": self.list_audit_events(user_id),
        }

    def complete_google_consent(self, user_id: str, *, email: str, granted_scopes: list[str]) -> None:
        connected_at = _now()
        with self._conn:
            self._conn.execute(
                "UPDATE users SET email = ?, scopes_json = ?, connected_at = ? WHERE user_id = ?",
                (email, json.dumps(granted_scopes), connected_at, user_id),
            )
        scope_text = ", ".join(granted_scopes) if granted_scopes else "no scopes"
        self.add_audit_event(user_id, "oauth_grant", f"Connected Google account ({email}) - granted {scope_text}")

    def update_scopes(self, user_id: str, scopes: list[str]) -> None:
        with self._conn:
            self._conn.execute(
                "UPDATE users SET scopes_json = ? WHERE user_id = ?", (json.dumps(scopes), user_id)
            )
        scope_text = ", ".join(scopes) if scopes else "none"
        self.add_audit_event(user_id, "scope_change", f"Scopes updated to: {scope_text}")

    def update_profile(self, user_id: str, *, name: str, dob: str | None) -> None:
        with self._conn:
            self._conn.execute("UPDATE users SET name = ?, dob = ? WHERE user_id = ?", (name, dob, user_id))
        self.add_audit_event(user_id, "profile_update", "Profile details updated")

    def set_sync_status(self, user_id: str, status: str) -> None:
        with self._conn:
            self._conn.execute("UPDATE users SET sync_status = ? WHERE user_id = ?", (status, user_id))

    def add_audit_event(self, user_id: str, event_type: str, detail: str) -> None:
        with self._conn:
            self._conn.execute(
                "INSERT INTO audit_events (event_id, user_id, type, detail, at) VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), user_id, event_type, detail, _now()),
            )

    def list_audit_events(self, user_id: str) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT event_id, type, detail, at FROM audit_events WHERE user_id = ? ORDER BY at DESC", (user_id,)
        ).fetchall()
        return [{"id": row["event_id"], "type": row["type"], "detail": row["detail"], "at": row["at"]} for row in rows]

    def create_session(self, user_id: str) -> str:
        session_token = uuid.uuid4().hex
        with self._conn:
            self._conn.execute(
                "INSERT INTO sessions (session_token, user_id, created_at) VALUES (?, ?, ?)",
                (session_token, user_id, _now()),
            )
        return session_token

    def resolve_session(self, session_token: str) -> str | None:
        row = self._conn.execute(
            "SELECT user_id FROM sessions WHERE session_token = ?", (session_token,)
        ).fetchone()
        return row["user_id"] if row else None

    def delete_session(self, session_token: str) -> None:
        with self._conn:
            self._conn.execute("DELETE FROM sessions WHERE session_token = ?", (session_token,))
