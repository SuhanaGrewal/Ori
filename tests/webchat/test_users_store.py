import sqlite3
from concurrent.futures import ThreadPoolExecutor

from ori.webchat.users_store import WebUsersStore


def test_create_user_and_get_profile(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")

    user_id = store.create_user("Jordan Kim", "1990-01-01")

    profile = store.get_user_profile(user_id)
    assert profile["id"] == user_id
    assert profile["name"] == "Jordan Kim"
    assert profile["dob"] == "1990-01-01"
    assert profile["email"] is None
    assert profile["scopes"] == []
    assert profile["connectedAt"] is None


def test_create_user_logs_account_created_audit_event(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")

    user_id = store.create_user("Jordan Kim", "1990-01-01")

    profile = store.get_user_profile(user_id)
    assert len(profile["auditLog"]) == 1
    assert profile["auditLog"][0]["type"] == "account_created"
    assert "Jordan Kim" in profile["auditLog"][0]["detail"]


def test_get_user_profile_unknown_id_returns_none(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")

    assert store.get_user_profile("does-not-exist") is None


def test_complete_google_consent_updates_profile_and_logs_event(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    user_id = store.create_user("Jordan Kim", "1990-01-01")

    store.complete_google_consent(user_id, email="jordan@gmail.com", granted_scopes=["gmail.readonly", "calendar.readonly"])

    profile = store.get_user_profile(user_id)
    assert profile["email"] == "jordan@gmail.com"
    assert profile["scopes"] == ["gmail.readonly", "calendar.readonly"]
    assert profile["connectedAt"] is not None
    assert profile["auditLog"][0]["type"] == "oauth_grant"
    assert "jordan@gmail.com" in profile["auditLog"][0]["detail"]


def test_update_scopes_logs_event(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    user_id = store.create_user("Jordan Kim", "1990-01-01")

    store.update_scopes(user_id, ["gmail.readonly"])

    profile = store.get_user_profile(user_id)
    assert profile["scopes"] == ["gmail.readonly"]
    assert profile["auditLog"][0]["type"] == "scope_change"


def test_update_profile_logs_event(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    user_id = store.create_user("Jordan Kim", "1990-01-01")

    store.update_profile(user_id, name="Jordan K.", dob="1990-02-02")

    profile = store.get_user_profile(user_id)
    assert profile["name"] == "Jordan K."
    assert profile["dob"] == "1990-02-02"
    assert profile["auditLog"][0]["type"] == "profile_update"


def test_audit_log_ordered_most_recent_first(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    user_id = store.create_user("Jordan Kim", "1990-01-01")

    store.update_profile(user_id, name="Jordan K.", dob="1990-02-02")

    profile = store.get_user_profile(user_id)
    types = [entry["type"] for entry in profile["auditLog"]]
    assert types == ["profile_update", "account_created"]


def test_create_session_and_resolve(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    user_id = store.create_user("Jordan Kim", "1990-01-01")

    token = store.create_session(user_id)

    assert store.resolve_session(token) == user_id


def test_resolve_unknown_session_returns_none(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")

    assert store.resolve_session("nonexistent-token") is None


def test_delete_session_invalidates_it(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    user_id = store.create_user("Jordan Kim", "1990-01-01")
    token = store.create_session(user_id)

    store.delete_session(token)

    assert store.resolve_session(token) is None


def test_store_usable_from_a_different_thread_than_it_was_created_on(tmp_path):
    # regression test: this store is built once at FastAPI startup (main
    # thread) but every sync endpoint request runs in a threadpool worker
    # thread - a plain sqlite3 connection raises ProgrammingError unless
    # opened with check_same_thread=False. Confirmed live: the real
    # server 500'd on the very first /api/auth/register call until this
    # was fixed.
    store = WebUsersStore(tmp_path / "users.db")

    with ThreadPoolExecutor(max_workers=1) as executor:
        user_id = executor.submit(store.create_user, "Jordan Kim", "1990-01-01").result()
        profile = executor.submit(store.get_user_profile, user_id).result()

    assert profile["name"] == "Jordan Kim"


def test_new_user_starts_with_not_started_sync_status(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    user_id = store.create_user("Jordan Kim", "1990-01-01")

    assert store.get_user_profile(user_id)["syncStatus"] == "not_started"


def test_set_sync_status_updates_profile(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    user_id = store.create_user("Jordan Kim", "1990-01-01")

    store.set_sync_status(user_id, "syncing")
    assert store.get_user_profile(user_id)["syncStatus"] == "syncing"

    store.set_sync_status(user_id, "complete")
    assert store.get_user_profile(user_id)["syncStatus"] == "complete"


def test_migrates_a_pre_existing_database_missing_sync_status_column(tmp_path):
    # regression test: this session's real webchat_users.db (and anyone
    # else's already-running deployment) was created before sync_status
    # existed - CREATE TABLE IF NOT EXISTS never retrofits a new column
    # onto a table that's already on disk, so without the ALTER TABLE
    # migration in __init__, opening an old database would either crash
    # or silently have no sync_status column at all.
    db_path = tmp_path / "old_users.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE users (
            user_id TEXT PRIMARY KEY, name TEXT NOT NULL, dob TEXT, email TEXT,
            scopes_json TEXT NOT NULL DEFAULT '[]', connected_at TEXT, created_at TEXT NOT NULL
        );
        """
    )
    conn.execute(
        "INSERT INTO users (user_id, name, scopes_json, created_at) VALUES ('user_old', 'Alex', '[]', '2026-01-01')"
    )
    conn.commit()
    conn.close()

    store = WebUsersStore(db_path)

    assert store.get_user_profile("user_old")["syncStatus"] == "not_started"


def test_users_are_isolated_from_each_other(tmp_path):
    store = WebUsersStore(tmp_path / "users.db")
    alice_id = store.create_user("Alice", "1990-01-01")
    bob_id = store.create_user("Bob", "1991-02-02")

    store.update_scopes(alice_id, ["gmail.readonly"])

    assert store.get_user_profile(alice_id)["scopes"] == ["gmail.readonly"]
    assert store.get_user_profile(bob_id)["scopes"] == []
