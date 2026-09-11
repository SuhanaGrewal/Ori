from datetime import datetime, timezone

from ori.digest.gather import gather_items, open_question_item
from ori.ingestion.calendar.event_parser import ParsedEvent
from ori.ingestion.calendar.store import CalendarStore
from ori.ingestion.docs.doc_parser import ParsedDoc
from ori.ingestion.docs.store import DocsStore
from ori.ingestion.gmail.message_parser import ParsedMessage
from ori.ingestion.gmail.store import GmailStore
from ori.ingestion.local_files.note_parser import ParsedNote
from ori.ingestion.local_files.store import NotesStore
from ori.entity_graph.store import EntityGraphStore

_SINCE = "2024-06-01T00:00:00Z"
_NOW = "2024-06-10T00:00:00Z"
_LOOKAHEAD_END = "2024-06-17T00:00:00Z"


def _message(
    message_id="msg-1", subject="Budget", sent_at="2024-06-05T00:00:00Z", label_ids=None,
    sender="Jane Doe <jane@example.com>", body_text=None,
) -> ParsedMessage:
    return ParsedMessage(
        message_id=message_id, thread_id=f"t-{message_id}", subject=subject, sender=sender,
        recipients=[], sent_at=sent_at,
        body_text=body_text if body_text is not None else "x" * 600,
        label_ids=label_ids or ["INBOX"], content_hash=f"hash-{message_id}",
    )


def _event() -> ParsedEvent:
    return ParsedEvent(
        calendar_id="primary", event_id="evt-1", ical_uid="evt-1@google.com", recurring_event_id=None,
        summary="Budget meeting", description="discuss budget", location="", status="confirmed",
        start_at="2024-06-12T00:00:00Z", end_at="2024-06-12T00:30:00Z", is_all_day=False,
        organizer_email="jane@example.com", attendees=[], source_updated_at="2024-06-01T00:00:00Z",
    )


def _doc() -> ParsedDoc:
    return ParsedDoc(
        doc_id="doc-1", title="Budget Plan", content_text="plan details",
        modified_time="2024-06-06T00:00:00Z", content_hash="hash-1",
    )


def _note() -> ParsedNote:
    return ParsedNote(
        path="note.txt", content_text="note details", content_hash="hash-1",
        size_bytes=10, mtime_ns=int(datetime(2024, 6, 7, tzinfo=timezone.utc).timestamp() * 1_000_000_000),
    )


def _empty_stores(tmp_path):
    return (
        GmailStore(tmp_path / "gmail.db"),
        CalendarStore(tmp_path / "calendar.db"),
        DocsStore(tmp_path / "docs.db"),
        NotesStore(tmp_path / "local_files.db"),
        EntityGraphStore(tmp_path / "entity_graph.db"),
    )


def test_gather_items_pulls_from_all_five_sources(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message())
    calendar_store.upsert_event(_event())
    docs_store.upsert_document(_doc())
    notes_store.upsert_note(_note())
    entity_store.upsert_entity("PERSON:email:jane@example.com", "PERSON", "email:jane@example.com", "Jane Doe")
    entity_store.add_mention("PERSON:email:jane@example.com", "gmail", "msg-1", None, "Jane Doe", "structured")

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    sources = {item["source"] for item in items}
    assert sources == {"gmail", "calendar", "docs", "local_files", "entity"}
    assert len(items) == 5


def test_gather_items_truncates_detail_to_500_chars(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message())

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    gmail_items = [item for item in items if item["source"] == "gmail"]
    assert len(gmail_items[0]["detail"]) == 500


def test_gather_items_gmail_label_uses_display_name_not_raw_email(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message(sender="Jane Doe <jane@example.com>"))

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    gmail_items = [item for item in items if item["source"] == "gmail"]
    assert "Jane Doe" in gmail_items[0]["label"]
    assert "Budget" in gmail_items[0]["label"]
    assert "jane@example.com" not in gmail_items[0]["label"]


def test_gather_items_gmail_label_falls_back_to_local_part_with_no_display_name(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message(sender="hello@notify.railway.app"))

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    gmail_items = [item for item in items if item["source"] == "gmail"]
    assert "hello" in gmail_items[0]["label"]
    assert "hello@notify.railway.app" not in gmail_items[0]["label"]


def test_gather_items_gmail_label_has_no_raw_iso_timestamp(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message(sent_at="2024-06-05T19:30:00+00:00"))

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    gmail_items = [item for item in items if item["source"] == "gmail"]
    assert "2024-06-05T19:30:00" not in gmail_items[0]["label"]


def test_gather_items_excludes_newsletter_by_unsubscribe_link_even_in_primary(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(
        _message(
            subject="This week's roundup", sender="Rahul Subramaniam <rahul@example.com>",
            label_ids=["INBOX"],  # lands in Primary, not CATEGORY_PROMOTIONS
            body_text="Here's the latest... " + "x" * 500 + " Click here to unsubscribe.",
        )
    )

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    gmail_items = [item for item in items if item["source"] == "gmail"]
    assert len(gmail_items) == 1
    assert "1 additional email" in gmail_items[0]["label"]


def test_gather_items_excludes_promotional_gmail_but_mentions_the_count(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message(subject="Big Sale", label_ids=["INBOX", "CATEGORY_PROMOTIONS"]))

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    gmail_items = [item for item in items if item["source"] == "gmail"]
    assert len(gmail_items) == 1
    assert not any("Big Sale" in item["label"] for item in gmail_items)
    assert "1 additional email" in gmail_items[0]["label"]


def test_gather_items_no_excluded_summary_when_nothing_was_filtered(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message(label_ids=["INBOX", "CATEGORY_PERSONAL"]))

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    gmail_items = [item for item in items if item["source"] == "gmail"]
    assert len(gmail_items) == 1
    assert "additional email" not in gmail_items[0]["label"]


def test_gather_items_includes_primary_gmail(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(_message(label_ids=["INBOX", "CATEGORY_PERSONAL"]))

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    assert any(item["source"] == "gmail" for item in items)


def test_gather_items_sorts_important_gmail_first(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    gmail_store.upsert_message(
        _message(message_id="early-not-important", subject="Early", sent_at="2024-06-02T00:00:00Z", label_ids=["INBOX"])
    )
    gmail_store.upsert_message(
        _message(
            message_id="later-important", subject="Later", sent_at="2024-06-08T00:00:00Z",
            label_ids=["INBOX", "IMPORTANT"],
        )
    )

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    gmail_labels = [item["label"] for item in items if item["source"] == "gmail"]
    assert "Later" in gmail_labels[0]
    assert "Early" in gmail_labels[1]


def test_gather_items_calendar_excludes_events_outside_lookahead_window(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    calendar_store.upsert_event(_event())  # start_at = 2024-06-12, inside [now, lookahead_end]

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now="2024-07-01T00:00:00Z", lookahead_end="2024-07-08T00:00:00Z",
    )

    assert not any(item["source"] == "calendar" for item in items)


def test_gather_items_empty_stores_returns_empty_list(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    assert items == []


def test_gather_items_entity_label_includes_mention_count(tmp_path):
    gmail_store, calendar_store, docs_store, notes_store, entity_store = _empty_stores(tmp_path)
    entity_store.upsert_entity("ORG:name:acme corp", "ORG", "name:acme corp", "Acme Corp")
    entity_store.add_mention("ORG:name:acme corp", "gmail", "msg-1", None, "Acme Corp", "ner")
    entity_store.add_mention("ORG:name:acme corp", "gmail", "msg-2", None, "Acme Corp", "ner")

    items = gather_items(
        gmail_store, calendar_store, docs_store, notes_store, entity_store,
        since=_SINCE, now=_NOW, lookahead_end=_LOOKAHEAD_END,
    )

    entity_items = [item for item in items if item["source"] == "entity"]
    assert "Acme Corp" in entity_items[0]["label"]
    assert "2 time(s)" in entity_items[0]["label"]


def test_open_question_item_labels_source_and_includes_question_text():
    item = open_question_item({"question_text": "did I get a reply from Nick", "asked_at": "2024-06-01T00:00:00+00:00"})

    assert item["source"] == "query_history"
    assert "did I get a reply from Nick" in item["label"]
    assert "2024-06-01T00:00:00+00:00" in item["label"]
