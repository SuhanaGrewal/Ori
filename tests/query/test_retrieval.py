from datetime import datetime, timezone

import numpy as np

from meridian.indexing.parent_child import ChunkRecord
from meridian.indexing.store import IndexStore
from meridian.query.retrieval import _fetch_and_filter_candidates, retrieve


class _FakeReranker:
    """returns a canned score per call, keyed by call order - scores map
    1:1 to the order `rerank()` passes texts in."""

    def __init__(self, scores_by_text):
        self.scores_by_text = scores_by_text

    def predict(self, pairs):
        return [self.scores_by_text.get(text, 0.0) for _, text in pairs]


def _seed(store, source, item_id, records, metadata):
    embeddings = [np.zeros(4, dtype=np.float32) for _ in records]
    store.upsert_item_chunks(source, item_id, records, embeddings, metadata)


def test_fetch_and_filter_resolves_chunk_ids_to_rows(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    _seed(
        store, "gmail", "msg-1",
        [ChunkRecord(text="hello", parent_text="hello", position=0, is_own_parent=True)],
        {"subject": "Hi", "sender": "a@example.com", "sent_at": "2024-06-12T00:00:00Z"},
    )

    rows = _fetch_and_filter_candidates(store, ["gmail:msg-1:0000"], None)

    assert len(rows) == 1
    assert rows[0]["chunk_text"] == "hello"


def test_fetch_and_filter_skips_unknown_chunk_ids(tmp_path):
    store = IndexStore(tmp_path / "index.db")

    rows = _fetch_and_filter_candidates(store, ["gmail:does-not-exist:0000"], None)

    assert rows == []


def test_fetch_and_filter_applies_date_range(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    _seed(
        store, "gmail", "msg-in-range",
        [ChunkRecord(text="a", parent_text="a", position=0, is_own_parent=True)],
        {"sent_at": "2024-06-12T00:00:00Z"},
    )
    _seed(
        store, "gmail", "msg-out-of-range",
        [ChunkRecord(text="b", parent_text="b", position=0, is_own_parent=True)],
        {"sent_at": "2024-01-01T00:00:00Z"},
    )
    date_range = (datetime(2024, 6, 10, tzinfo=timezone.utc), datetime(2024, 6, 17, tzinfo=timezone.utc))

    rows = _fetch_and_filter_candidates(
        store, ["gmail:msg-in-range:0000", "gmail:msg-out-of-range:0000"], date_range
    )

    assert len(rows) == 1
    assert rows[0]["source_item_id"] == "msg-in-range"


def test_fetch_and_filter_docs_survive_date_range_with_no_date_metadata(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    _seed(
        store, "docs", "doc-1",
        [ChunkRecord(text="content", parent_text="content", position=0, is_own_parent=True)],
        {"title": "My Doc"},
    )
    date_range = (datetime(2024, 6, 10, tzinfo=timezone.utc), datetime(2024, 6, 17, tzinfo=timezone.utc))

    rows = _fetch_and_filter_candidates(store, ["docs:doc-1:0000"], date_range)

    assert len(rows) == 1


def test_fetch_and_filter_dedups_children_sharing_a_parent(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    shared_parent = "a long parent context shared by two children"
    records = [
        ChunkRecord(text="child one", parent_text=shared_parent, position=0, is_own_parent=False),
        ChunkRecord(text="child two", parent_text=shared_parent, position=1, is_own_parent=False),
    ]
    _seed(store, "gmail", "msg-1", records, {"subject": "Hi"})

    rows = _fetch_and_filter_candidates(
        store, ["gmail:msg-1:0000", "gmail:msg-1:0001"], None
    )

    assert len(rows) == 1
    assert rows[0]["parent_text"] == shared_parent


def test_fetch_and_filter_excludes_revoked_sources(tmp_path):
    # real bug: revoking a data-source scope in Settings only ever
    # updated a display field - nothing in the query pipeline read it
    # back to actually stop searching that source. This is the retrieval-
    # level enforcement half of the fix.
    store = IndexStore(tmp_path / "index.db")
    _seed(
        store, "calendar", "evt-1",
        [ChunkRecord(text="meeting", parent_text="meeting", position=0, is_own_parent=True)],
        {"summary": "Standup"},
    )
    _seed(
        store, "gmail", "msg-1",
        [ChunkRecord(text="email", parent_text="email", position=0, is_own_parent=True)],
        {"subject": "Hi"},
    )

    rows = _fetch_and_filter_candidates(
        store, ["calendar:evt-1:0000", "gmail:msg-1:0000"], None, frozenset({"calendar"})
    )

    assert [row["source"] for row in rows] == ["gmail"]


def test_retrieve_excludes_revoked_sources_end_to_end(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "calendar", "evt-1",
        [ChunkRecord(text="team meeting", parent_text="team meeting", position=0, is_own_parent=True)],
        [query_vec],
        {"summary": "Standup"},
    )
    reranker = _FakeReranker({"team meeting": 10.0})

    result = retrieve(store, "meeting", query_vec, reranker=reranker, excluded_sources=frozenset({"calendar"}))

    assert result.abstained is True
    assert result.chunks == []


def test_retrieve_breaks_near_tied_scores_by_recency(tmp_path):
    # real bug: asking the identical question several times against
    # multiple near-identical real receipts from the same sender picked a
    # different one each time, never consistently the actually most-recent
    # one - the reranker's own near-tied scores aren't a meaningful
    # ranking to trust as-is at that point.
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "gmail", "receipt-old",
        [ChunkRecord(text="anthropic receipt old", parent_text="anthropic receipt old", position=0, is_own_parent=True)],
        [query_vec], {"subject": "Receipt", "sent_at": "2024-01-01T00:00:00Z"},
    )
    store.upsert_item_chunks(
        "gmail", "receipt-new",
        [ChunkRecord(text="anthropic receipt new", parent_text="anthropic receipt new", position=0, is_own_parent=True)],
        [query_vec], {"subject": "Receipt", "sent_at": "2024-06-01T00:00:00Z"},
    )
    # identical scores - a genuine tie, not just "close"
    reranker = _FakeReranker({"anthropic receipt old": 5.0, "anthropic receipt new": 5.0})

    result = retrieve(store, "anthropic charge", query_vec, reranker=reranker)

    assert result.chunks[0].source_item_id == "receipt-new"


def test_retrieve_recency_tiebreak_compares_whole_near_tied_group_not_just_top_two(tmp_path):
    # real bug found via LIVE re-verification, not just the unit test
    # above: with three real near-identical receipts, the true
    # most-recent one scored ~0.09 below the top candidate, while a
    # genuinely-older one sat right next to the top at ~0.02 below. An
    # earlier version of this fix only compared the top two ranked
    # candidates and "fixed" the wrong pair - promoting the middle
    # receipt instead of the actual most recent one, since the real
    # most-recent candidate wasn't even in slot #2 to be compared. Raw
    # scores below reproduce that exact real gap pattern (sigmoid(-0.85)
    # ~= 0.30, sigmoid(-0.94) ~= 0.28, sigmoid(-1.32) ~= 0.21).
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "gmail", "receipt-oldest",
        [ChunkRecord(text="receipt oldest", parent_text="receipt oldest", position=0, is_own_parent=True)],
        [query_vec], {"subject": "Receipt", "sent_at": "2024-01-01T00:00:00Z"},
    )
    store.upsert_item_chunks(
        "gmail", "receipt-middle",
        [ChunkRecord(text="receipt middle", parent_text="receipt middle", position=0, is_own_parent=True)],
        [query_vec], {"subject": "Receipt", "sent_at": "2024-04-01T00:00:00Z"},
    )
    store.upsert_item_chunks(
        "gmail", "receipt-most-recent",
        [ChunkRecord(text="receipt most recent", parent_text="receipt most recent", position=0, is_own_parent=True)],
        [query_vec], {"subject": "Receipt", "sent_at": "2024-09-01T00:00:00Z"},
    )
    reranker = _FakeReranker({
        "receipt oldest": -0.85, "receipt middle": -0.94, "receipt most recent": -1.32,
    })

    result = retrieve(store, "the charge", query_vec, reranker=reranker)

    assert result.chunks[0].source_item_id == "receipt-most-recent"
    # real bug found via LIVE re-verification AFTER this fix first
    # shipped: all three receipts score well below the 0.5 abstain
    # threshold (~0.30/0.28/0.21 here), so a resolved tiebreak that still
    # left `abstained=True` handed the decision to ask()'s separate,
    # non-deterministic per-candidate LLM relevance tiebreak - which
    # iterated the same three candidates and could reject the one this
    # recency check just chose, silently falling back to an older one.
    # A real, resolved near-tie is its own confidence signal and should
    # not need to survive a second, less predictable check.
    assert result.abstained is False


def test_retrieve_does_not_override_a_clear_score_gap(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "gmail", "receipt-old-but-clearly-relevant",
        [ChunkRecord(text="the real answer", parent_text="the real answer", position=0, is_own_parent=True)],
        [query_vec], {"subject": "Receipt", "sent_at": "2024-01-01T00:00:00Z"},
    )
    store.upsert_item_chunks(
        "gmail", "receipt-new-but-irrelevant",
        [ChunkRecord(text="unrelated content", parent_text="unrelated content", position=0, is_own_parent=True)],
        [query_vec], {"subject": "Receipt", "sent_at": "2024-06-01T00:00:00Z"},
    )
    reranker = _FakeReranker({"the real answer": 10.0, "unrelated content": -10.0})

    result = retrieve(store, "question", query_vec, reranker=reranker)

    assert result.chunks[0].source_item_id == "receipt-old-but-clearly-relevant"


def test_retrieve_does_not_swap_tied_candidates_without_parseable_dates(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "docs", "doc-a",
        [ChunkRecord(text="doc a content", parent_text="doc a content", position=0, is_own_parent=True)],
        [query_vec], {"title": "Doc A"},
    )
    store.upsert_item_chunks(
        "docs", "doc-b",
        [ChunkRecord(text="doc b content", parent_text="doc b content", position=0, is_own_parent=True)],
        [query_vec], {"title": "Doc B"},
    )
    reranker = _FakeReranker({"doc a content": 5.0, "doc b content": 5.0})

    result = retrieve(store, "question", query_vec, reranker=reranker)

    # docs have no date concept at all - order stays whatever the stable
    # sort already produced, no crash from the missing dates
    assert {c.source_item_id for c in result.chunks} == {"doc-a", "doc-b"}


def test_retrieve_returns_high_confidence_result(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "gmail", "msg-1",
        [ChunkRecord(text="quarterly budget report", parent_text="quarterly budget report", position=0, is_own_parent=True)],
        [query_vec],
        {"subject": "Budget", "sent_at": "2024-06-12T00:00:00Z"},
    )
    reranker = _FakeReranker({"quarterly budget report": 10.0})

    result = retrieve(store, "budget report", query_vec, reranker=reranker)

    assert result.abstained is False
    assert result.abstain_reason is None
    assert len(result.chunks) == 1
    assert result.chunks[0].source == "gmail"
    assert result.confidence > 0.99


def test_retrieve_on_empty_index_abstains_no_candidates(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    reranker = _FakeReranker({})

    result = retrieve(store, "anything", np.zeros(4, dtype=np.float32), reranker=reranker)

    assert result.abstained is True
    assert result.abstain_reason == "no_candidates"
    assert result.chunks == []


def test_retrieve_date_range_emptying_pool_gives_distinct_abstain_reason(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "gmail", "msg-1",
        [ChunkRecord(text="old budget report", parent_text="old budget report", position=0, is_own_parent=True)],
        [query_vec],
        {"sent_at": "2020-01-01T00:00:00Z"},
    )
    reranker = _FakeReranker({"old budget report": 10.0})
    date_range = (datetime(2024, 6, 10, tzinfo=timezone.utc), datetime(2024, 6, 17, tzinfo=timezone.utc))

    result = retrieve(store, "budget report", query_vec, reranker=reranker, date_range=date_range)

    assert result.abstained is True
    assert result.abstain_reason == "no_candidates_in_date_range"


def test_retrieve_low_confidence_abstains_but_still_returns_chunks(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "gmail", "msg-1",
        [ChunkRecord(text="unrelated content", parent_text="unrelated content", position=0, is_own_parent=True)],
        [query_vec],
        {"subject": "unrelated content"},
    )
    reranker = _FakeReranker({"unrelated content": -10.0})

    result = retrieve(store, "unrelated", query_vec, reranker=reranker)

    assert result.abstained is True
    assert result.abstain_reason == "low_confidence"
    assert len(result.chunks) == 1  # still surfaced, just marked low-confidence


def test_retrieve_respects_top_k(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    scores = {}
    for i in range(5):
        text = f"budget item {i}"
        store.upsert_item_chunks(
            "gmail", f"msg-{i}",
            [ChunkRecord(text=text, parent_text=text, position=0, is_own_parent=True)],
            [query_vec],
            {"subject": text},
        )
        scores[text] = 5.0 + i

    result = retrieve(store, "budget item", query_vec, reranker=_FakeReranker(scores), top_k=2)

    assert len(result.chunks) == 2
    # highest-scoring items first
    assert result.chunks[0].confidence >= result.chunks[1].confidence


def test_fetch_and_filter_keeps_distinct_parents(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    _seed(
        store, "gmail", "msg-1",
        [ChunkRecord(text="a", parent_text="parent A", position=0, is_own_parent=True)],
        {},
    )
    _seed(
        store, "gmail", "msg-2",
        [ChunkRecord(text="b", parent_text="parent B", position=0, is_own_parent=True)],
        {},
    )

    rows = _fetch_and_filter_candidates(
        store, ["gmail:msg-1:0000", "gmail:msg-2:0000"], None
    )

    assert len(rows) == 2
