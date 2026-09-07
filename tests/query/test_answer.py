from datetime import datetime, timezone

import numpy as np

from ori.conversation.store import ConversationStore
from ori.indexing.parent_child import ChunkRecord
from ori.indexing.store import IndexStore
from ori.query.answer import _was_actually_rewritten, ask, ask_with_compound_split

_NOW = datetime(2024, 6, 12, 15, 30, tzinfo=timezone.utc)


class _FakeEmbedder:
    def __init__(self, vector):
        self._vector = vector

    def encode(self, texts, batch_size=32, show_progress_bar=False):
        return np.array([self._vector for _ in texts])


class _FakeReranker:
    def __init__(self, scores_by_text):
        self.scores_by_text = scores_by_text

    def predict(self, pairs):
        return [self.scores_by_text.get(text, 0.0) for _, text in pairs]


class _FakeSpan:
    def __init__(self, start, end, entity_type, score=1.0):
        self.start = start
        self.end = end
        self.entity_type = entity_type
        self.score = score


class _FakeAnalyzer:
    """detects one hardcoded name substring - just enough to prove the
    tokenize -> call -> untokenize round trip without needing presidio."""

    def analyze(self, text, entities, language):
        needle = "Jane Doe"
        index = text.find(needle)
        if index == -1:
            return []
        return [_FakeSpan(index, index + len(needle), "PERSON")]


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


class _FakeMultiReplyMessages:
    def __init__(self, replies):
        self._replies = list(replies)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse(self._replies.pop(0))


class _FakeMultiReplyClient:
    def __init__(self, replies):
        self.messages = _FakeMultiReplyMessages(replies)


class _QuestionAwareFakeReranker:
    """unlike _FakeReranker above, scores depend on the question too, not
    just the candidate text - needed to prove ask_with_compound_split()
    actually retrieves relevant content independently per sub-question,
    not just once for the original two-topic question."""

    def predict(self, pairs):
        scores = []
        for question, text in pairs:
            if "pan" in question.lower():
                scores.append(10.0 if "pan" in text.lower() else -10.0)
            else:
                scores.append(10.0 if "laptop" in text.lower() else -10.0)
        return scores


class _RaisingClient:
    """fails the test if the llm is ever called - used to prove abstain is zero-cost."""

    @property
    def messages(self):
        raise AssertionError("the llm must not be called when retrieval abstains")


def _seed_high_confidence_chunk(store, text, query_vec, metadata=None):
    store.upsert_item_chunks(
        "gmail",
        "msg-1",
        [ChunkRecord(text=text, parent_text=text, position=0, is_own_parent=True)],
        [query_vec],
        metadata or {"subject": "Hi", "sent_at": "2024-06-12T00:00:00Z"},
    )


def test_ask_abstains_without_calling_llm_on_empty_index(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)

    result = ask(
        "anything",
        store=store,
        embedder=_FakeEmbedder(query_vec),
        reranker=_FakeReranker({}),
        analyzer=_FakeAnalyzer(),
        client=_RaisingClient(),
        model="claude-haiku-4-5",
        now=_NOW,
    )

    assert result.abstained is True
    assert result.abstain_reason == "no_candidates"
    assert result.answer is None
    assert result.sources is None


def test_ask_excludes_revoked_sources(tmp_path):
    # real bug: revoking a data-source scope in Settings never actually
    # stopped that source's content from being used in answers.
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "quarterly budget report", query_vec)
    reranker = _FakeReranker({"quarterly budget report": 10.0})

    result = ask(
        "budget report", store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=_RaisingClient(), model="claude-haiku-4-5", now=_NOW,
        excluded_sources=frozenset({"gmail"}),
    )

    assert result.abstained is True
    assert result.chunks == []


def test_ask_returns_retrieval_only_when_no_client_configured(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "quarterly budget report", query_vec)
    reranker = _FakeReranker({"quarterly budget report": 10.0})

    result = ask(
        "budget report",
        store=store,
        embedder=_FakeEmbedder(query_vec),
        reranker=reranker,
        analyzer=_FakeAnalyzer(),
        client=None,
        model="claude-haiku-4-5",
        now=_NOW,
    )

    assert result.abstained is False
    assert result.llm_configured is False
    assert result.answer is None
    assert result.sources is None
    assert len(result.chunks) == 1
    assert result.confidence > 0.99


def test_ask_generates_answer_and_untokenizes_placeholders_back(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(
        store,
        "Jane Doe presented the quarterly budget report",
        query_vec,
        metadata={"subject": "Budget", "sender": "a@example.com", "sent_at": "2024-06-12T00:00:00Z"},
    )
    reranker = _FakeReranker({"Jane Doe presented the quarterly budget report": 10.0})
    client = _FakeClient("According to the context, <PERSON_1> presented the report [1].")

    result = ask(
        "who presented the budget report",
        store=store,
        embedder=_FakeEmbedder(query_vec),
        reranker=reranker,
        analyzer=_FakeAnalyzer(),
        client=client,
        model="claude-haiku-4-5",
        now=_NOW,
    )

    assert result.abstained is False
    assert result.llm_configured is True
    assert result.answer == "According to the context, Jane Doe presented the report [1]."
    assert result.sources == (
        "Sources:\n[1] Gmail email from a@example.com, sent 2024-06-12T00:00:00Z (today), subject: 'Budget'"
    )
    # the tokenized placeholder, never the real name, must be what actually left the machine
    sent_user_message = client.messages.calls[0]["messages"][0]["content"]
    assert "Jane Doe" not in sent_user_message
    assert "<PERSON_1>" in sent_user_message


def test_ask_records_an_audit_event_for_the_external_llm_call(tmp_path):
    import json

    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(
        store, "Jane Doe presented the quarterly budget report", query_vec,
        metadata={"subject": "Budget", "sender": "a@example.com", "sent_at": "2024-06-12T00:00:00Z"},
    )
    reranker = _FakeReranker({"Jane Doe presented the quarterly budget report": 10.0})
    client = _FakeClient("An answer [1].")
    audit_log_dir = tmp_path / "logs"

    ask(
        "who presented the budget report",
        store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5",
        now=_NOW, audit_log_dir=audit_log_dir,
    )

    lines = (audit_log_dir / "audit.log").read_text().strip().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["event_type"] == "llm.external_call"
    assert entry["detail"]["operation"] == "query.ask"
    assert "entity_counts" in entry["detail"]


def test_ask_low_confidence_abstain_with_no_client_never_calls_llm(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "unrelated content", query_vec, metadata={"subject": "x"})
    reranker = _FakeReranker({"unrelated content": -10.0})

    result = ask(
        "unrelated",
        store=store,
        embedder=_FakeEmbedder(query_vec),
        reranker=reranker,
        analyzer=_FakeAnalyzer(),
        client=None,
        model="claude-haiku-4-5",
        now=_NOW,
    )

    assert result.abstained is True
    assert result.abstain_reason == "low_confidence"
    assert result.answer is None


def test_ask_low_confidence_tiebreak_confirms_no_still_abstains(tmp_path):
    # the reranker scored it too low to trust, and the LLM tiebreak agrees
    # it's not actually relevant - correctly still abstains, just via one
    # extra confirming call rather than a raw score cutoff alone.
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "unrelated content", query_vec, metadata={"subject": "x"})
    reranker = _FakeReranker({"unrelated content": -10.0})
    client = _FakeClient("NO")

    result = ask(
        "unrelated",
        store=store,
        embedder=_FakeEmbedder(query_vec),
        reranker=reranker,
        analyzer=_FakeAnalyzer(),
        client=client,
        model="claude-haiku-4-5",
        now=_NOW,
    )

    assert result.abstained is True
    assert result.abstain_reason == "low_confidence"
    assert result.answer is None
    assert len(client.messages.calls) == 1


def test_ask_low_confidence_tiebreak_confirms_yes_answers_anyway(tmp_path):
    # the reranker scored the genuinely-correct top candidate too low to
    # trust on its own - the LLM tiebreak confirms it's actually relevant,
    # so this should un-abstain and generate an answer from just that one
    # confirmed chunk, not the full unfiltered candidate pool.
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(
        store, "the laptop drop-off is at the office on Tuesday", query_vec,
        metadata={"subject": "IT Kit", "sender": "billy@example.com", "sent_at": "2024-06-01T00:00:00Z"},
    )
    reranker = _FakeReranker({"the laptop drop-off is at the office on Tuesday": -10.0})
    client = _FakeMultiReplyClient(["YES", "You need to drop it off at the office on Tuesday [1]."])

    result = ask(
        "where do I drop off my laptop",
        store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is False
    assert result.answer == "You need to drop it off at the office on Tuesday [1]."
    assert len(result.chunks) == 1
    assert len(client.messages.calls) == 2


def test_ask_low_confidence_tiebreak_checks_every_candidate_not_just_the_top_one(tmp_path):
    # real bug, found via testing a heavily typo-laden question ("wen do
    # i hav to droop off my laptp"): the reranker scored every candidate
    # low enough to abstain, and the tiebreak used to check only
    # chunks[0] - the highest-scored candidate. That candidate is
    # essentially noise when everything is scored this low; the
    # genuinely correct email can easily rank below it and never get
    # checked at all.
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "gmail", "msg-unrelated",
        [ChunkRecord(text="unrelated exam gossip", parent_text="unrelated exam gossip", position=0, is_own_parent=True)],
        [query_vec], {"subject": "x", "sent_at": "2024-06-01T00:00:00Z"},
    )
    store.upsert_item_chunks(
        "gmail", "msg-billy",
        [ChunkRecord(
            text="the laptop drop-off is at the office", parent_text="the laptop drop-off is at the office",
            position=0, is_own_parent=True,
        )],
        [query_vec], {"subject": "IT Kit", "sender": "billy@example.com", "sent_at": "2024-06-01T00:00:00Z"},
    )
    # both below the abstain threshold, but "unrelated" scores higher so
    # it ranks first - exactly the "wrong chunk happens to rank above the
    # right one once scores are this noisy" shape of the real bug.
    reranker = _FakeReranker({"unrelated exam gossip": -1.0, "the laptop drop-off is at the office": -2.0})
    client = _FakeMultiReplyClient(["NO", "YES", "You need to drop it off at the office [1]."])

    result = ask(
        "wen do i hav to droop off my laptp",
        store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is False
    assert result.answer == "You need to drop it off at the office [1]."
    assert len(result.chunks) == 1
    assert result.chunks[0].source_item_id == "msg-billy"
    assert len(client.messages.calls) == 3


def test_ask_recency_tiebreak_skips_the_llm_relevance_cascade_entirely(tmp_path):
    # real bug found via LIVE re-verification, discovered only after the
    # retrieval-level recency tiebreak (see test_retrieval.py) had already
    # shipped: three near-identical real receipts all scored well below
    # the abstain threshold, so even after retrieve() deterministically
    # reordered the most-recent one to the front, ask()'s abstain check
    # still saw a low raw score and ran the separate per-candidate LLM
    # relevance tiebreak below - a real, non-deterministic Claude call
    # that iterated the same three candidates and could reject the
    # recency-preferred one, silently falling back to an older one. Same
    # question, different wrong answer each time - the exact symptom the
    # recency tiebreak was built to remove, reintroduced by a second
    # mechanism running after it. retrieve() no longer abstains when it
    # resolves a real near-tie this way, so this cascade must never even
    # start: only one LLM call (the final answer) should happen.
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
    client = _FakeMultiReplyClient(["The most recent charge was in September [1]."])

    result = ask(
        "the charge", store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is False
    # not narrowed to a single chunk - unlike the LLM tiebreak, skipping
    # it leaves the full recency-ordered candidate list intact, same as
    # any other non-abstained result
    assert result.chunks[0].source_item_id == "receipt-most-recent"
    # exactly one LLM call (the final answer) - no tiebreak calls at all
    assert len(client.messages.calls) == 1


def test_ask_forward_looking_query_falls_back_to_past_match_when_nothing_upcoming(tmp_path):
    # "next week" (2024-06-17 to 2024-06-24) excludes this past-dated
    # chunk entirely - the fallback (unfiltered) search should still find
    # it and let the LLM frame "nothing upcoming, here's your last one"
    # using the existing recency-labeling machinery, rather than just
    # abstaining because the strict date filter found nothing.
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(
        store, "Flight booking confirmation for your trip", query_vec,
        metadata={"subject": "Flight", "sender": "airline@example.com", "sent_at": "2024-05-01T00:00:00Z"},
    )
    reranker = _FakeReranker({"Flight booking confirmation for your trip": 10.0})
    client = _FakeClient("There's nothing upcoming, but your last flight was on May 1st [1].")

    result = ask(
        "any upcoming flight bookings next week",
        store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is False
    assert result.answer == "There's nothing upcoming, but your last flight was on May 1st [1]."
    assert len(result.chunks) == 1


def test_ask_forward_looking_query_abstains_with_no_upcoming_match_when_nothing_at_all(tmp_path):
    # a past-dated, unrelated chunk exists (so hybrid search finds
    # something and the date filter is what actually excludes it - not an
    # empty index), but it's a poor semantic match even once the date
    # filter is lifted in the fallback, and the LLM tiebreak agrees it's
    # not relevant either - nothing usable in either direction, so this
    # should land on the more specific "no_upcoming_match" reason, not
    # the generic "no_candidates".
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(
        store, "unrelated old content", query_vec,
        metadata={"subject": "x", "sent_at": "2024-05-01T00:00:00Z"},
    )
    reranker = _FakeReranker({"unrelated old content": -10.0})
    client = _FakeClient("NO")

    result = ask(
        "any upcoming flight bookings next week",
        store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is True
    assert result.abstain_reason == "no_upcoming_match"
    assert result.answer is None


def test_ask_backward_looking_query_does_not_fall_back(tmp_path):
    # "last week" found nothing in range - unlike a forward-looking query,
    # this should NOT retry unfiltered, since surfacing an unrelated item
    # from some other time as a substitute for "last week" wouldn't make
    # sense to the user.
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(
        store, "Flight booking confirmation for your trip", query_vec,
        metadata={"subject": "Flight", "sender": "airline@example.com", "sent_at": "2024-05-01T00:00:00Z"},
    )
    reranker = _FakeReranker({"Flight booking confirmation for your trip": 10.0})

    result = ask(
        "what happened last week", store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=_RaisingClient(), model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is True
    assert result.abstain_reason == "no_candidates_in_date_range"


def test_was_actually_rewritten_ignores_case_whitespace_and_trailing_punctuation():
    # real bug: rewrite_followup_question() is told to return an
    # already-self-contained question completely unchanged, but the real
    # model still capitalized "was" -> "Was" on one that needed no
    # rewriting at all. A byte-exact comparison misreads that cosmetic
    # cleanup as "genuinely rewritten."
    assert _was_actually_rewritten("was i in the hackathons winner list?", "Was i in the hackathons winner list?") is False
    assert _was_actually_rewritten("what about next month", "  what about next month  ") is False
    assert _was_actually_rewritten("is it done", "is it done?") is False


def test_was_actually_rewritten_true_for_a_genuine_followup_resolution():
    assert _was_actually_rewritten("when will it be delivered", "when will my PAN application be delivered") is True


def test_ask_with_conversation_id_but_empty_thread_skips_rewrite(tmp_path):
    # a fresh thread has nothing to rewrite against yet - only one LLM
    # call (the answer itself) should happen, same as a stateless ask().
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "quarterly budget report", query_vec)
    reranker = _FakeReranker({"quarterly budget report": 10.0})
    client = _FakeClient("Here's the budget report [1].")
    conversation_store = ConversationStore(tmp_path / "conversations.db")

    result = ask(
        "budget report", store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
        conversation_id="thread-1", conversation_store=conversation_store,
    )

    assert result.answer == "Here's the budget report [1]."
    assert len(client.messages.calls) == 1


def test_ask_with_conversation_history_rewrites_followup_first(tmp_path):
    conversation_store = ConversationStore(tmp_path / "conversations.db")
    conversation_store.add_turn("thread-1", "user", "what's on my calendar this month")
    conversation_store.add_turn("thread-1", "assistant", "You have a meeting on the 10th [1].")

    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "next month's calendar entry", query_vec)
    reranker = _FakeReranker({"next month's calendar entry": 10.0})
    client = _FakeMultiReplyClient([
        "what's on my calendar next month",
        "You have a meeting on the 3rd of next month [1].",
    ])

    result = ask(
        "what about next month", store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
        conversation_id="thread-1", conversation_store=conversation_store,
    )

    assert result.answer == "You have a meeting on the 3rd of next month [1]."
    assert len(client.messages.calls) == 2
    rewrite_call_content = client.messages.calls[0]["messages"][0]["content"]
    assert "what's on my calendar this month" in rewrite_call_content
    assert "what about next month" in rewrite_call_content


def test_ask_records_original_question_and_answer_as_new_turns(tmp_path):
    conversation_store = ConversationStore(tmp_path / "conversations.db")
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "quarterly budget report", query_vec)
    reranker = _FakeReranker({"quarterly budget report": 10.0})
    client = _FakeClient("Here's the budget report [1].")

    ask(
        "budget report", store=store, embedder=_FakeEmbedder(query_vec), reranker=reranker,
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
        conversation_id="thread-1", conversation_store=conversation_store,
    )

    turns = conversation_store.list_turns("thread-1")
    assert [t["role"] for t in turns] == ["user", "assistant"]
    assert turns[0]["content"] == "budget report"
    assert turns[1]["content"] == "Here's the budget report [1]."


def test_ask_falls_back_to_previous_grounding_when_followup_abstains(tmp_path):
    # real bug: a follow-up correctly gets rewritten to be about the right
    # item ("when will my pan application be delivered"), but that item's
    # own text ("your e-pan file has been processed") has too little
    # textual overlap with the follow-up's wording to clear the
    # reranker's confidence threshold on its own - retrieve() runs a
    # fresh, independent search every time, with no notion that we were
    # just definitely discussing this exact document.
    conversation_store = ConversationStore(tmp_path / "conversations.db")
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "your e-pan file has been processed", query_vec)

    client = _FakeMultiReplyClient([
        "Your e-PAN is ready [1].",
        "when will my pan application be delivered",
        "The email about your PAN doesn't mention a delivery date [1].",
    ])

    first = ask(
        "what's the status of my pan application", store=store, embedder=_FakeEmbedder(query_vec),
        reranker=_FakeReranker({"your e-pan file has been processed": 10.0}),
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
        conversation_id="thread-1", conversation_store=conversation_store,
    )
    assert first.abstained is False

    second = ask(
        "when will it be delivered", store=store, embedder=_FakeEmbedder(query_vec),
        reranker=_FakeReranker({}),  # fresh, independent retrieval finds nothing confident on its own
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
        conversation_id="thread-1", conversation_store=conversation_store,
    )

    assert second.abstained is False
    assert second.answer == "The email about your PAN doesn't mention a delivery date [1]."
    assert second.chunks[0].parent_text == "your e-pan file has been processed"


def test_ask_does_not_recover_previous_grounding_for_a_fresh_self_contained_question(tmp_path):
    # real bug: "was i in the hackathons winner list?" is a clean,
    # self-contained fresh topic switch, not a follow-up - a real,
    # directly-matching email (a Devpost competition-winners notice)
    # existed in the index, but this fresh question's own retrieval
    # abstained on its own (a fake/low reranker score here, standing in
    # for whatever made the real hybrid search miss it), and - before
    # this fix - the sticky-fallback fired anyway just because history
    # existed, forcing in the PRIOR turn's completely unrelated grounding
    # (a British Airways flight chunk) and producing "I can only see your
    # British Airways flight booking" instead of a real search ever
    # running.
    #
    # The rewrite reply below deliberately capitalizes "Was" - confirmed
    # against the REAL model that this happens even when
    # REWRITE_FOLLOWUP_SYSTEM_PROMPT explicitly says to return an
    # already-self-contained question completely unchanged. An earlier,
    # weaker version of this fix compared the raw strings directly and
    # missed this exact case (a plain "!=" treated the capitalization
    # fix as "genuinely rewritten" and fired the fallback anyway,
    # reproducing the live bug even with the guard in place) - this test
    # exists specifically to hold the fix to real-world rewrite noise,
    # not just a byte-identical no-op.
    conversation_store = ConversationStore(tmp_path / "conversations.db")
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "your british airways flight departs", query_vec)

    client = _FakeMultiReplyClient([
        "Your flight already happened [1].",
        "Was i in the hackathons winner list?",  # cosmetic-only rewrite, not a real one
        "NO",  # tiebreak: the low-confidence flight chunk does not answer this
    ])

    first = ask(
        "whats the status with my upcoming flights", store=store, embedder=_FakeEmbedder(query_vec),
        reranker=_FakeReranker({"your british airways flight departs": 10.0}),
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
        conversation_id="thread-1", conversation_store=conversation_store,
    )
    assert first.abstained is False

    second = ask(
        "was i in the hackathons winner list?", store=store, embedder=_FakeEmbedder(query_vec),
        # explicitly negative, not just absent-from-dict (which defaults
        # to 0.0 and, after the reranker's own sigmoid, becomes exactly
        # 0.5 - the abstain threshold itself, which does NOT abstain since
        # the check is a strict "<"). This must land clearly below it.
        reranker=_FakeReranker({"your british airways flight departs": -10.0}),
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
        conversation_id="thread-1", conversation_store=conversation_store,
    )

    assert second.abstained is True
    assert second.abstain_reason == "low_confidence"


def test_ask_still_abstains_on_followup_with_no_prior_grounded_turn(tmp_path):
    # a follow-up with conversation history but nothing grounded to fall
    # back to (the earlier turn in this thread itself abstained, and
    # abstains are never persisted - see
    # test_ask_does_not_record_turns_when_abstaining) should abstain
    # exactly as it did before this fallback existed.
    conversation_store = ConversationStore(tmp_path / "conversations.db")
    conversation_store.add_turn("thread-1", "user", "an earlier question that itself abstained")

    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)

    result = ask(
        "when will it be delivered", store=store, embedder=_FakeEmbedder(query_vec),
        reranker=_FakeReranker({}), analyzer=_FakeAnalyzer(),
        client=_FakeMultiReplyClient(["when will it be delivered"]),
        model="claude-haiku-4-5", now=_NOW, conversation_id="thread-1", conversation_store=conversation_store,
    )

    assert result.abstained is True


def test_ask_does_not_record_turns_when_abstaining(tmp_path):
    conversation_store = ConversationStore(tmp_path / "conversations.db")
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)

    ask(
        "anything", store=store, embedder=_FakeEmbedder(query_vec), reranker=_FakeReranker({}),
        analyzer=_FakeAnalyzer(), client=None, model="claude-haiku-4-5", now=_NOW,
        conversation_id="thread-1", conversation_store=conversation_store,
    )

    assert conversation_store.list_turns("thread-1") == []


def test_ask_with_compound_split_falls_through_to_ask_for_a_single_question(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    _seed_high_confidence_chunk(store, "your pan application is approved", query_vec)
    client = _FakeMultiReplyClient(["SINGLE", "Your PAN application is approved [1]."])

    result = ask_with_compound_split(
        "whats my pan status", store=store, embedder=_FakeEmbedder(query_vec), reranker=_FakeReranker({}),
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is False
    assert result.answer == "Your PAN application is approved [1]."
    assert len(client.messages.calls) == 2  # split-check, then the normal single-question ask()


def test_ask_with_compound_split_answers_both_halves_of_a_genuinely_compound_question(tmp_path):
    # real bug: a genuinely two-topic question aborted retrieval entirely
    # instead of answering either half - a single embedding/search pass
    # over both topics dilutes toward neither one well enough to clear
    # the confidence threshold that either topic alone clears easily on
    # its own.
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    store.upsert_item_chunks(
        "gmail", "msg-pan",
        [ChunkRecord(text="your pan application is approved", parent_text="your pan application is approved", position=0, is_own_parent=True)],
        [query_vec], {"subject": "PAN", "sent_at": "2024-06-01T00:00:00Z"},
    )
    store.upsert_item_chunks(
        "gmail", "msg-laptop",
        [ChunkRecord(text="laptop drop off is monday", parent_text="laptop drop off is monday", position=0, is_own_parent=True)],
        [query_vec], {"subject": "IT Kit", "sent_at": "2024-06-01T00:00:00Z"},
    )
    client = _FakeMultiReplyClient([
        "What is my pan application status?\nWhen do I need to drop off my laptop?",
        "Your PAN application is approved [1].",
        "You need to drop off your laptop on Monday [1].",
    ])

    result = ask_with_compound_split(
        "whats my pan status and also whats the laptop drop off date",
        store=store, embedder=_FakeEmbedder(query_vec), reranker=_QuestionAwareFakeReranker(),
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is False
    assert "What is my pan application status?" in result.answer
    assert "Your PAN application is approved [1]." in result.answer
    assert "When do I need to drop off my laptop?" in result.answer
    # renumbered, not a citation collision with the first sub-answer's [1]
    assert "You need to drop off your laptop on Monday [3]." in result.answer
    assert result.chunks[0].source_item_id == "msg-pan"
    assert result.chunks[2].source_item_id == "msg-laptop"
    assert len(client.messages.calls) == 3  # split-check + one answer call per sub-question


def test_ask_with_compound_split_abstains_when_both_halves_abstain(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    query_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    client = _FakeMultiReplyClient([
        "What is my pan application status?\nWhen do I need to drop off my laptop?",
    ])

    result = ask_with_compound_split(
        "whats my pan status and also whats the laptop drop off date",
        store=store, embedder=_FakeEmbedder(query_vec), reranker=_FakeReranker({}),
        analyzer=_FakeAnalyzer(), client=client, model="claude-haiku-4-5", now=_NOW,
    )

    assert result.abstained is True
    assert result.answer is None
    assert result.chunks == []
