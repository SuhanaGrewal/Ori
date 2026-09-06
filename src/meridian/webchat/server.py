from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from meridian.auth.scopes import SCOPES as READONLY_SCOPES
from meridian.auth.token_store import EncryptedTokenStore
from meridian.common.config import config_for_user, ensure_dirs, load_config
from meridian.common.logging import get_logger
from meridian.conversation.store import ConversationStore
from meridian.entity_graph.store import EntityGraphStore
from meridian.inbox_intelligence.store import InboxIntelligenceStore
from meridian.indexing.embedder import build_embedder
from meridian.indexing.store import IndexStore
from meridian.ingestion.calendar.store import CalendarStore
from meridian.ingestion.docs.store import DocsStore
from meridian.ingestion.gmail.store import GmailStore
from meridian.ingestion.local_files.store import NotesStore
from meridian.query.anthropic_client import build_client
from meridian.query.answer import ask
from meridian.query.prompt import build_abstain_message
from meridian.query.reranker import build_reranker
from meridian.query.router import route
from meridian.redaction.analyzer import build_analyzer_engine
from meridian.reminders.store import ReminderStore
from meridian.replies.store import DraftStore
from meridian.webchat.digest_summary import build_digest_items
from meridian.webchat.initial_sync import run_initial_sync
from meridian.webchat.oauth_web_flow import (
    build_web_flow,
    exchange_code_for_credentials,
    fetch_google_email,
    get_authorization_url,
)
from meridian.webchat.users_store import WebUsersStore

# two different localhost ports (frontend dev server vs this API) are two
# different origins to the browser - session state is therefore carried
# as a bearer token the frontend stores itself (matching the existing
# mock's own localStorage-based session, just storing a real opaque
# token instead of a raw user id), not a cookie. A cookie set by this
# server's origin would never reach fetch() calls made from the
# frontend's origin without extra cross-origin cookie plumbing (SameSite/
# proxy config) that isn't worth it for a personal, local-only tool.
FRONTEND_ORIGIN = "http://localhost:3000"
BACKEND_BASE_URL = "http://localhost:8420"
GOOGLE_CALLBACK_PATH = "/api/auth/google/callback"

_config = load_config()
_users = WebUsersStore(_config.data_dir / "webchat_users.db")
_logger = get_logger("meridian.webchat.server", log_dir=_config.log_dir)

# these are genuinely expensive to construct (real model loads) and are
# stateless, safe to share across every user's requests - only the
# per-user *stores* below get built fresh per request, rooted under that
# user's own config_for_user() data_dir. Same "build once, reuse" pattern
# every CLI entry point in this project already follows for these three.
_embedder = build_embedder()
_reranker = build_reranker()
_analyzer = build_analyzer_engine()
_client = build_client(_config.llm_api_key) if _config.llm_api_key else None

app = FastAPI(title="Meridian webchat backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_user(user_id: str) -> dict[str, Any]:
    profile = _users.get_user_profile(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Unknown user")
    return profile


class RegisterBody(BaseModel):
    name: str
    dob: str | None = None


class ScopesBody(BaseModel):
    scopes: list[str]


class ProfileBody(BaseModel):
    name: str
    dob: str | None = None


@app.post("/api/auth/register")
def register(body: RegisterBody) -> dict[str, Any]:
    user_id = _users.create_user(body.name, body.dob)
    return _require_user(user_id)


@app.get("/api/auth/users/{user_id}")
def get_user(user_id: str) -> dict[str, Any]:
    return _require_user(user_id)


@app.get("/api/auth/google/start")
def google_start(user_id: str = Query(...)) -> RedirectResponse:
    _require_user(user_id)  # 404s early rather than sending an unknown user through Google
    flow = build_web_flow(
        _config.google_client_id, _config.google_client_secret, BACKEND_BASE_URL + GOOGLE_CALLBACK_PATH
    )
    url = get_authorization_url(flow, state=user_id)
    return RedirectResponse(url)


@app.get(GOOGLE_CALLBACK_PATH)
def google_callback(
    background_tasks: BackgroundTasks, code: str = Query(...), state: str = Query(...)
) -> RedirectResponse:
    user_id = state
    _require_user(user_id)

    flow = build_web_flow(
        _config.google_client_id, _config.google_client_secret, BACKEND_BASE_URL + GOOGLE_CALLBACK_PATH
    )
    credentials = exchange_code_for_credentials(flow, code=code)
    email = fetch_google_email(credentials) or "unknown@gmail.com"

    per_user_config = config_for_user(_config, user_id)
    per_user_config.auth_dir.mkdir(parents=True, exist_ok=True)
    EncryptedTokenStore(per_user_config.auth_dir).save(credentials)

    # only the read-only scopes this app actually asked for are ever
    # granted by Google in the first place - reporting exactly those
    # back (not the extra openid/userinfo.email scopes only used to look
    # up the email address) matches what the frontend's scope-toggle UI
    # means by "granted".
    granted_readonly = [scope for scope in (credentials.scopes or []) if scope in READONLY_SCOPES]
    _users.complete_google_consent(user_id, email=email, granted_scopes=granted_readonly)

    # runs after this redirect is sent, not before - a full first-time
    # Gmail/Calendar/Docs backfill can take a while, and the user
    # shouldn't sit on a blank tab waiting for it. The frontend can poll
    # GET /api/auth/users/{user_id} and watch syncStatus go
    # not_started -> syncing -> complete.
    background_tasks.add_task(
        run_initial_sync, user_id, config=_config, users=_users, embedder=_embedder, logger=_logger
    )

    session_token = _users.create_session(user_id)
    return RedirectResponse(f"{FRONTEND_ORIGIN}/dashboard?session={session_token}")


@app.get("/api/auth/session/{session_token}")
def resolve_session(session_token: str) -> dict[str, Any]:
    user_id = _users.resolve_session(session_token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return _require_user(user_id)


@app.post("/api/auth/logout/{session_token}")
def logout(session_token: str) -> dict[str, str]:
    _users.delete_session(session_token)
    return {"status": "ok"}


@app.post("/api/auth/users/{user_id}/scopes")
def update_scopes(user_id: str, body: ScopesBody) -> dict[str, Any]:
    _require_user(user_id)
    _users.update_scopes(user_id, body.scopes)
    return _require_user(user_id)


@app.post("/api/auth/users/{user_id}/profile")
def update_profile(user_id: str, body: ProfileBody) -> dict[str, Any]:
    _require_user(user_id)
    _users.update_profile(user_id, name=body.name, dob=body.dob)
    return _require_user(user_id)


@app.get("/api/auth/users/{user_id}/audit-log")
def get_audit_log(user_id: str) -> list[dict[str, Any]]:
    _require_user(user_id)
    return _users.list_audit_events(user_id)


class QueryBody(BaseModel):
    user_id: str
    question: str
    thread_id: str | None = None


def _chunk_to_citation(chunk: Any) -> dict[str, str]:
    """{label, detail} matching the frontend's citation-pill shape -
    label is a short source identifier, detail the fuller description.
    Deliberately built here rather than reusing query/prompt.py's private
    _source_label() as-is, since that produces one combined string and
    the frontend wants the short/full split into two fields."""
    metadata = chunk.metadata
    if chunk.source == "gmail":
        return {"label": metadata.get("sender", "Email"), "detail": metadata.get("subject", "")}
    if chunk.source == "calendar":
        return {"label": metadata.get("summary", "Calendar event"), "detail": metadata.get("start_at", "")}
    if chunk.source == "docs":
        return {"label": metadata.get("title", "Document"), "detail": "Google Doc"}
    if chunk.source == "local_files":
        return {"label": metadata.get("path", "Note"), "detail": "Local note"}
    return {"label": chunk.source, "detail": ""}


def _build_all_stores(per_user_config: Any) -> dict[str, Any]:
    ensure_dirs(per_user_config)
    return {
        "gmail_store": GmailStore(per_user_config.ingestion_dir / "gmail" / "gmail.db"),
        "calendar_store": CalendarStore(per_user_config.ingestion_dir / "calendar" / "calendar.db"),
        "docs_store": DocsStore(per_user_config.ingestion_dir / "docs" / "docs.db"),
        "notes_store": NotesStore(per_user_config.ingestion_dir / "local_files" / "local_files.db"),
        "entity_store": EntityGraphStore(per_user_config.entity_graph_dir / "entity_graph.db"),
        "inbox_store": InboxIntelligenceStore(per_user_config.inbox_intelligence_dir / "commitments.db"),
        "reminder_store": ReminderStore(per_user_config.reminders_dir / "reminders.db"),
        "draft_store": DraftStore(per_user_config.replies_dir / "drafts.db"),
        "index_store": IndexStore(per_user_config.indexing_dir / "index.db"),
    }


@app.post("/api/query")
def query(body: QueryBody) -> dict[str, Any]:
    """mirrors query/__main__.py's own orchestration exactly (route()
    first, fall through to ask() if it returns no answer) - this endpoint
    is not a new query pipeline, just that same pipeline exposed over
    HTTP and rooted under one user's own per-user config/stores instead
    of the shared single-user data_dir a CLI run assumes."""
    _require_user(body.user_id)
    per_user_config = config_for_user(_config, body.user_id)
    stores = _build_all_stores(per_user_config)
    answer_id = f"answer_{uuid.uuid4().hex[:12]}"

    if _client is not None:
        router_result = route(
            body.question,
            gmail_store=stores["gmail_store"],
            inbox_store=stores["inbox_store"],
            account_email=stores["gmail_store"].get_account_email(),
            client=_client,
            model=per_user_config.llm_model,
            analyzer=_analyzer,
            calendar_store=stores["calendar_store"],
            docs_store=stores["docs_store"],
            notes_store=stores["notes_store"],
            entity_store=stores["entity_store"],
            reminder_store=stores["reminder_store"],
            draft_store=stores["draft_store"],
            logger=_logger,
            audit_log_dir=per_user_config.log_dir,
        )
        if router_result.answer is not None:
            return {"id": answer_id, "question": body.question, "answer": router_result.answer, "citations": []}

    conversation_store = ConversationStore(per_user_config.conversation_dir / "conversations.db") if body.thread_id else None
    result = ask(
        body.question,
        store=stores["index_store"],
        embedder=_embedder,
        reranker=_reranker,
        analyzer=_analyzer,
        client=_client,
        model=per_user_config.llm_model,
        logger=_logger,
        audit_log_dir=per_user_config.log_dir,
        conversation_id=body.thread_id,
        conversation_store=conversation_store,
    )

    if result.abstained:
        answer = build_abstain_message(body.question, result.abstain_reason or "low_confidence")
        return {"id": answer_id, "question": body.question, "answer": answer, "citations": []}

    citations = [_chunk_to_citation(chunk) for chunk in result.chunks]
    answer_text = result.answer if result.answer is not None else "LLM not configured - showing retrieval only."
    return {"id": answer_id, "question": body.question, "answer": answer_text, "citations": citations}


@app.get("/api/digest")
def digest(user_id: str = Query(...)) -> dict[str, Any]:
    _require_user(user_id)
    per_user_config = config_for_user(_config, user_id)
    stores = _build_all_stores(per_user_config)

    now = datetime.now(tz=timezone.utc)
    items = build_digest_items(
        stores["gmail_store"], stores["calendar_store"], stores["docs_store"], stores["notes_store"],
        stores["entity_store"], client=_client, model=per_user_config.llm_model, analyzer=_analyzer,
        now=now, logger=_logger, audit_log_dir=per_user_config.log_dir,
    )
    return {"date": now.strftime("%a %b %d %Y"), "items": items}
