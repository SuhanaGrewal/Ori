from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ori.auth.scopes import SCOPES as READONLY_SCOPES
from ori.auth.token_store import EncryptedTokenStore
from ori.common.config import config_for_user, ensure_dirs, load_config
from ori.common.logging import get_logger
from ori.conversation.store import ConversationStore
from ori.entity_graph.store import EntityGraphStore
from ori.inbox_intelligence.store import InboxIntelligenceStore
from ori.indexing.embedder import build_embedder
from ori.indexing.store import IndexStore
from ori.ingestion.calendar.store import CalendarStore
from ori.ingestion.docs.store import DocsStore
from ori.ingestion.gmail.store import GmailStore
from ori.ingestion.local_files.store import NotesStore
from ori.query.anthropic_client import build_client
from ori.query.answer import ask_with_compound_split
from ori.query.prompt import build_abstain_message
from ori.query.reranker import build_reranker
from ori.query.router import route
from ori.redaction.analyzer import build_analyzer_engine
from ori.reminders.store import ReminderStore
from ori.replies.store import DraftStore
from ori.webchat.citations import chunk_to_citation, cited_chunks
from ori.webchat.digest_summary import build_digest_items
from ori.webchat.initial_sync import run_initial_sync
from ori.webchat.oauth_web_flow import (
    build_web_flow,
    exchange_code_for_credentials,
    fetch_google_email,
    get_authorization_url,
)
from ori.webchat.scopes import revoked_sources
from ori.webchat.users_store import WebUsersStore

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
_logger = get_logger("ori.webchat.server", log_dir=_config.log_dir)

# these are genuinely expensive to construct (real model loads) and are
# stateless, safe to share across every user's requests - only the
# per-user *stores* below get built fresh per request, rooted under that
# user's own config_for_user() data_dir. Same "build once, reuse" pattern
# every CLI entry point in this project already follows for these three.
_embedder = build_embedder()
_reranker = build_reranker()
_analyzer = build_analyzer_engine()
_client = build_client(_config.llm_api_key) if _config.llm_api_key else None

app = FastAPI(title="Ori webchat backend")
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
    user = _require_user(body.user_id)
    per_user_config = config_for_user(_config, body.user_id)
    stores = _build_all_stores(per_user_config)
    answer_id = f"answer_{uuid.uuid4().hex[:12]}"
    excluded_sources = revoked_sources(user)

    # gmail_store itself is NOT optional in route() (it's required for
    # intent classification and most handlers), so a revoked gmail scope
    # skips the router path entirely and falls through to the main
    # ask()/retrieve() path below, which excludes gmail via
    # excluded_sources the same way calendar/docs are excluded here.
    # calendar_store/docs_store/notes_store ARE already optional in
    # route() (confirmed: the existing broad_summary handler already
    # treats None as "this source isn't available") - passing None for a
    # revoked one reuses that existing behavior rather than adding a new
    # mechanism.
    if _client is not None and "gmail" not in excluded_sources:
        router_result = route(
            body.question,
            gmail_store=stores["gmail_store"],
            inbox_store=stores["inbox_store"],
            account_email=stores["gmail_store"].get_account_email(),
            client=_client,
            model=per_user_config.llm_model,
            analyzer=_analyzer,
            calendar_store=stores["calendar_store"] if "calendar" not in excluded_sources else None,
            docs_store=stores["docs_store"] if "docs" not in excluded_sources else None,
            notes_store=stores["notes_store"],
            entity_store=stores["entity_store"],
            reminder_store=stores["reminder_store"],
            draft_store=stores["draft_store"],
            logger=_logger,
            audit_log_dir=per_user_config.log_dir,
        )
        if router_result.answer is not None:
            # router_result.citations is already {label, detail}-shaped
            # (see query/router.py) - cited_chunks() just narrows it to
            # the [N] bracket numbers actually referenced in the answer's
            # prose, no chunk_to_citation() mapping step needed since
            # these were never RetrievedChunk objects in the first place.
            router_citations = cited_chunks(router_result.answer, router_result.citations)
            return {
                "id": answer_id, "question": body.question, "answer": router_result.answer,
                "citations": router_citations,
            }

    conversation_store = ConversationStore(per_user_config.conversation_dir / "conversations.db") if body.thread_id else None
    result = ask_with_compound_split(
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
        excluded_sources=excluded_sources,
    )

    if result.abstained:
        answer = build_abstain_message(body.question, result.abstain_reason or "low_confidence")
        return {"id": answer_id, "question": body.question, "answer": answer, "citations": []}

    if result.answer is None:
        # no LLM configured - these are the raw retrieved candidates
        # themselves, not a synthesized claim, so showing the full pool
        # is exactly right here (there's no "what did the answer actually
        # reference" question to ask).
        answer_text = "LLM not configured - showing retrieval only."
        citations = [chunk_to_citation(chunk) for chunk in result.chunks]
    else:
        # a real generated answer with zero [N] markers is NOT the same
        # situation as "no LLM configured" - it's how the model looks
        # when it correctly reviews low-confidence candidates and says
        # none of them are relevant (found live: "whats up w wix"
        # retrieved unrelated emails, the model correctly said "the
        # context doesn't mention Wix at all", but the API still showed
        # those unrelated emails as "citations" because cited_chunks()'s
        # retrieval-only fallback used to fire on ANY uncited answer, not
        # just the true no-LLM case above). An uncited real answer gets
        # no citations, not a guess at which candidate it meant.
        answer_text = result.answer
        citations = [chunk_to_citation(chunk) for chunk in cited_chunks(answer_text, result.chunks, fallback_to_full_pool=False)]
    return {"id": answer_id, "question": body.question, "answer": answer_text, "citations": citations}


@app.get("/api/digest")
def digest(user_id: str = Query(...)) -> dict[str, Any]:
    user = _require_user(user_id)
    per_user_config = config_for_user(_config, user_id)
    stores = _build_all_stores(per_user_config)

    now = datetime.now(tz=timezone.utc)
    items = build_digest_items(
        stores["gmail_store"], stores["calendar_store"], stores["docs_store"], stores["notes_store"],
        stores["entity_store"], client=_client, model=per_user_config.llm_model, analyzer=_analyzer,
        now=now, logger=_logger, audit_log_dir=per_user_config.log_dir,
        excluded_sources=revoked_sources(user),
    )
    return {"date": now.strftime("%a %b %d %Y"), "items": items}
