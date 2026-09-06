from meridian.query.compound import maybe_split_compound_question


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


def test_maybe_split_returns_none_without_a_client():
    result = maybe_split_compound_question(
        "whats my pan status and also whats the laptop drop off date",
        client=None, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(),
    )

    assert result is None


def test_maybe_split_returns_none_for_a_single_response():
    client = _FakeClient("SINGLE")

    result = maybe_split_compound_question(
        "whats my pan status and when will it be delivered",
        client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(),
    )

    assert result is None


def test_maybe_split_returns_sub_questions_for_a_genuinely_compound_question():
    # real bug: a genuinely two-topic question aborted retrieval entirely
    # instead of answering either half - a single embedding/search pass
    # over both topics dilutes toward neither one well enough to clear
    # the confidence threshold.
    client = _FakeClient(
        "What is my pan application status?\nWhen do I need to drop off my laptop?"
    )

    result = maybe_split_compound_question(
        "whats my pan status and also whats the laptop drop off date",
        client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(),
    )

    assert result == ["What is my pan application status?", "When do I need to drop off my laptop?"]


def test_maybe_split_ignores_stray_single_marker_mixed_with_other_lines():
    # defensive: if the model doesn't follow instructions cleanly and
    # emits SINGLE alongside other text, treat the whole response as
    # SINGLE rather than risk a malformed two-item "split" - a false
    # split just costs one wasted extra ask() call, a bad split could
    # silently generate a nonsense sub-question.
    client = _FakeClient("SINGLE\nWhat is my pan application status?")

    result = maybe_split_compound_question(
        "whats my pan status", client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(),
    )

    assert result is None


def test_maybe_split_returns_none_for_an_empty_response():
    client = _FakeClient("")

    result = maybe_split_compound_question(
        "whats my pan status", client=client, model="claude-haiku-4-5", analyzer=_FakeAnalyzer(),
    )

    assert result is None
