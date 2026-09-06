from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path

from dotenv import load_dotenv

from meridian.common.logging import register_secret


@dataclass(frozen=True)
class Config:
    data_dir: Path
    log_dir: Path
    notes_folder: Path | None
    google_client_id: str
    google_client_secret: str
    llm_api_key: str
    llm_model: str

    @property
    def auth_dir(self) -> Path:
        return self.data_dir / "auth"

    @property
    def ingestion_dir(self) -> Path:
        return self.data_dir / "ingestion"

    @property
    def indexing_dir(self) -> Path:
        return self.data_dir / "indexing"

    @property
    def entity_graph_dir(self) -> Path:
        return self.data_dir / "entity_graph"

    @property
    def digest_dir(self) -> Path:
        return self.data_dir / "digest"

    @property
    def security_dir(self) -> Path:
        return self.data_dir / "security"

    @property
    def inbox_intelligence_dir(self) -> Path:
        return self.data_dir / "inbox_intelligence"

    @property
    def query_dir(self) -> Path:
        return self.data_dir / "query"

    @property
    def reminders_dir(self) -> Path:
        return self.data_dir / "reminders"

    @property
    def notifications_dir(self) -> Path:
        return self.data_dir / "notifications"

    @property
    def replies_dir(self) -> Path:
        return self.data_dir / "replies"

    @property
    def conversation_dir(self) -> Path:
        return self.data_dir / "conversation"


def load_config(*, load_env_file=True) -> Config:
    if load_env_file:
        load_dotenv()

    notes_folder = os.environ.get("MERIDIAN_NOTES_FOLDER", "").strip()

    config = Config(
        data_dir=Path(os.environ.get("MERIDIAN_DATA_DIR", "./data")).expanduser().resolve(),
        log_dir=Path(os.environ.get("MERIDIAN_LOG_DIR", "./logs")).expanduser().resolve(),
        notes_folder=Path(notes_folder).expanduser().resolve() if notes_folder else None,
        google_client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID", ""),
        google_client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", ""),
        llm_api_key=os.environ.get("LLM_API_KEY", ""),
        llm_model=os.environ.get("LLM_MODEL", "claude-haiku-4-5"),
    )
    # every phase's __main__.py already calls load_config() - this is the
    # single choke point that makes the log-scrubbing guard apply
    # everywhere with no other file needing an edit.
    register_secret(config.google_client_secret)
    register_secret(config.llm_api_key)
    return config


def config_for_user(base_config: Config, user_id: str) -> Config:
    """derives a per-user Config for the webchat multi-user backend by
    rooting data_dir under base_config.data_dir/users/<user_id> - every
    existing single-user store/module (ingestion, indexing, auth tokens,
    reminders, etc.) keeps working completely unmodified, just pointed at
    one user's own isolated directory instead of the shared top-level
    data_dir. google_client_id/secret and llm_api_key/model stay shared -
    those are app-level credentials, not per-user data. log_dir also
    stays shared (operational logs, not personal data) - only data_dir
    changes."""
    return replace(base_config, data_dir=base_config.data_dir / "users" / user_id)


def ensure_dirs(config: Config) -> None:
    config.data_dir.mkdir(parents=True, exist_ok=True)
    config.log_dir.mkdir(parents=True, exist_ok=True)
    config.auth_dir.mkdir(parents=True, exist_ok=True)
    config.ingestion_dir.mkdir(parents=True, exist_ok=True)
    config.indexing_dir.mkdir(parents=True, exist_ok=True)
    config.entity_graph_dir.mkdir(parents=True, exist_ok=True)
    config.digest_dir.mkdir(parents=True, exist_ok=True)
    config.security_dir.mkdir(parents=True, exist_ok=True)
    config.inbox_intelligence_dir.mkdir(parents=True, exist_ok=True)
    config.query_dir.mkdir(parents=True, exist_ok=True)
    config.reminders_dir.mkdir(parents=True, exist_ok=True)
    config.notifications_dir.mkdir(parents=True, exist_ok=True)
    config.replies_dir.mkdir(parents=True, exist_ok=True)
    config.conversation_dir.mkdir(parents=True, exist_ok=True)
