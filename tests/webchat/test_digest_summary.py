from datetime import datetime, timezone

from ori.entity_graph.store import EntityGraphStore
from ori.ingestion.calendar.store import CalendarStore
from ori.ingestion.docs.store import DocsStore
from ori.ingestion.gmail.message_parser import ParsedMessage
from ori.ingestion.gmail.store import GmailStore
from ori.ingestion.local_files.store import NotesStore
from ori.webchat.digest_summary import build_digest_items

_NOW = datetime(2024, 6, 10, tzinfo=timezone.utc)


class _FakeAnalyzer:
    def analyze(self, text, entities, language):
        return []


class _FakeMessages:
    def __init__(self, reply_text):
        self.reply_text = reply_text
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse(self.reply_text)


class _FakeResponse:
    def __init__(self, text):
        self.content = [_FakeTextBlock(text)]


class _FakeTextBlock:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class _FakeClient:
    def __init__(self, reply_text):
        self.messages = _FakeMessages(reply_text)


def _message(message_id="msg-1", subject="Budget", sent_at="2024-06-09T00:00:00Z") -> ParsedMessage:
    return ParsedMessage(
        message_id=message_id, thread_id=f"t-{message_id}", subject=subject, sender="jane@example.com",
        recipients=[], sent_at=sent_at, body_text="x" * 100, label_ids=["INBOX"], content_hash=f"hash-{message_id}",
    )


def _empty_stores(tmp_path):
    return (
        GmailStore(tmp_path / "gmail.db"),
        CalendarStore(tmp_path / "calendar.db"),
        DocsStore(tmp_path / "docs.db"),
        NotesStore(tmp_path / "local_files.db"),
        EntityGraphStore(tmp_path / "entity_graph.db"),
    )


def test_build_digest_items_returns_empty_when_nothing_gathered(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    client = _FakeClient("should never be called")

    items = build_digest_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(), now=_NOW,
    )

    assert items == []
    assert client.messages.calls == []


def test_build_digest_items_returns_empty_without_a_client(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message())

    items = build_digest_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        client=None, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(), now=_NOW,
    )

    assert items == []


def test_build_digest_items_parses_llm_response_into_lines(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message())
    client = _FakeClient("3 replies drafted, ready to send\nInvoice #4471 due Friday")

    items = build_digest_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(), now=_NOW,
    )

    assert items == ["3 replies drafted, ready to send", "Invoice #4471 due Friday"]


def test_build_digest_items_strips_bullet_markers(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message())
    client = _FakeClient("- 3 replies drafted\n• Invoice due Friday")

    items = build_digest_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(), now=_NOW,
    )

    assert items == ["3 replies drafted", "Invoice due Friday"]


def test_build_digest_items_excludes_revoked_sources(tmp_path):
    # real bug: revoking a scope in Settings never actually stopped that
    # source's content from being used - this is the digest-endpoint half
    # of the fix, filtering gathered items by their own "source" tag
    # rather than threading the concept into the shared digest/gather.py
    # module (also used by the single-user CLI digest, which has no
    # notion of per-user OAuth scopes at all).
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message())
    client = _FakeClient("should never be called")

    items = build_digest_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(), now=_NOW,
        excluded_sources=frozenset({"gmail"}),
    )

    assert items == []
    assert client.messages.calls == []


def test_build_digest_items_nothing_new_response_becomes_empty_list(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message())
    client = _FakeClient("Nothing new to report.")

    items = build_digest_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(), now=_NOW,
    )

    assert items == []
