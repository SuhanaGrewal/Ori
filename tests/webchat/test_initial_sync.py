import logging

from ori.common.config import Config
from ori.webchat import initial_sync as initial_sync_module
from ori.webchat.initial_sync import run_initial_sync
from ori.webchat.users_store import WebUsersStore


def _make_config(tmp_path) -> Config:
    return Config(
        data_dir=tmp_path,
        log_dir=tmp_path / "logs",
        notes_folder=None,
        google_client_id="client-id",
        google_client_secret="client-secret",
        llm_api_key="",
        llm_model="claude-haiku-4-5",
    )


def _patch_all_google_calls(monkeypatch, *, gmail_error=None, docs_error=None, indexing_error=None):
    monkeypatch.setattr(initial_sync_module, "get_credentials", lambda config, interactive: object())
    monkeypatch.setattr(initial_sync_module, "build_gmail_service", lambda credentials: object())
    monkeypatch.setattr(initial_sync_module, "build_calendar_service", lambda credentials: object())
    monkeypatch.setattr(initial_sync_module, "build_docs_service", lambda credentials: object())
    monkeypatch.setattr(initial_sync_module, "build_drive_service", lambda credentials: object())

    def _run_gmail_sync(service, store, *, rate_limiter, logger):
        if gmail_error is not None:
            raise gmail_error

    def _run_docs_sync(drive_service, docs_service, store, *, rate_limiter, logger):
        if docs_error is not None:
            raise docs_error

    def _run_indexing(ingestion_dir, store, embedder, *, logger):
        if indexing_error is not None:
            raise indexing_error
        return {}

    monkeypatch.setattr(initial_sync_module, "run_gmail_sync", _run_gmail_sync)
    monkeypatch.setattr(initial_sync_module, "run_calendar_sync", lambda *a, **k: None)
    monkeypatch.setattr(initial_sync_module, "run_docs_sync", _run_docs_sync)
    monkeypatch.setattr(initial_sync_module, "run_indexing", _run_indexing)


def test_successful_sync_marks_status_complete_and_logs_audit_event(tmp_path, monkeypatch):
    config = _make_config(tmp_path)
    users = WebUsersStore(tmp_path / "users.db")
    user_id = users.create_user("Jordan Kim", "1990-01-01")
    _patch_all_google_calls(monkeypatch)

    run_initial_sync(user_id, config=config, users=users, embedder=object(), logger=logging.getLogger("test"))

    profile = users.get_user_profile(user_id)
    assert profile["syncStatus"] == "complete"
    assert any(event["type"] == "sync_complete" for event in profile["auditLog"])


def test_credentials_failure_marks_status_error_without_crashing(tmp_path, monkeypatch):
    config = _make_config(tmp_path)
    users = WebUsersStore(tmp_path / "users.db")
    user_id = users.create_user("Jordan Kim", "1990-01-01")

    def _raise(config, interactive):
        raise RuntimeError("no stored credentials")

    monkeypatch.setattr(initial_sync_module, "get_credentials", _raise)

    run_initial_sync(user_id, config=config, users=users, embedder=object(), logger=logging.getLogger("test"))

    profile = users.get_user_profile(user_id)
    assert profile["syncStatus"] == "error"
    assert any(event["type"] == "sync_error" for event in profile["auditLog"])


def test_one_source_failing_does_not_block_the_others_or_indexing(tmp_path, monkeypatch):
    # dead-letter behavior: a single source erroring (e.g. Docs API not
    # enabled for this account) must not abort the whole sync - indexing
    # should still run over whatever did succeed, and status should still
    # reach "complete".
    config = _make_config(tmp_path)
    users = WebUsersStore(tmp_path / "users.db")
    user_id = users.create_user("Jordan Kim", "1990-01-01")
    _patch_all_google_calls(monkeypatch, docs_error=RuntimeError("Docs API disabled"))

    run_initial_sync(user_id, config=config, users=users, embedder=object(), logger=logging.getLogger("test"))

    assert users.get_user_profile(user_id)["syncStatus"] == "complete"


def test_indexing_failure_marks_status_error(tmp_path, monkeypatch):
    config = _make_config(tmp_path)
    users = WebUsersStore(tmp_path / "users.db")
    user_id = users.create_user("Jordan Kim", "1990-01-01")
    _patch_all_google_calls(monkeypatch, indexing_error=RuntimeError("index build failed"))

    run_initial_sync(user_id, config=config, users=users, embedder=object(), logger=logging.getLogger("test"))

    profile = users.get_user_profile(user_id)
    assert profile["syncStatus"] == "error"
    assert any(event["type"] == "sync_error" for event in profile["auditLog"])


def test_sync_status_is_syncing_before_credentials_resolve(tmp_path, monkeypatch):
    config = _make_config(tmp_path)
    users = WebUsersStore(tmp_path / "users.db")
    user_id = users.create_user("Jordan Kim", "1990-01-01")

    seen_status = {}

    def _capture_and_raise(config, interactive):
        seen_status["value"] = users.get_user_profile(user_id)["syncStatus"]
        raise RuntimeError("boom")

    monkeypatch.setattr(initial_sync_module, "get_credentials", _capture_and_raise)

    run_initial_sync(user_id, config=config, users=users, embedder=object(), logger=logging.getLogger("test"))

    assert seen_status["value"] == "syncing"
