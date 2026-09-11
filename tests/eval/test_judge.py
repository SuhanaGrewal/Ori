from tests.eval.judge import score_completeness, score_correctness, score_faithfulness, score_relevance


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


def test_score_faithfulness_parses_digit_into_a_0_to_1_score():
    client = _FakeClient("5")

    score = score_faithfulness("the sky is blue", "the sky is blue", client=client, model="claude-haiku-4-5")

    assert score == 1.0


def test_score_faithfulness_sends_context_and_answer_to_the_judge():
    client = _FakeClient("5")

    score_faithfulness("real context here", "the answer here", client=client, model="claude-haiku-4-5")

    sent = client.messages.calls[0]["messages"][0]["content"]
    assert "real context here" in sent
    assert "the answer here" in sent


def test_score_relevance_low_score_maps_to_low_fraction():
    client = _FakeClient("1")

    score = score_relevance("what time is it", "unrelated answer", client=client, model="claude-haiku-4-5")

    assert score == 1 / 5


def test_score_completeness_mid_score():
    client = _FakeClient("3")

    score = score_completeness("q", "context", "answer", client=client, model="claude-haiku-4-5")

    assert score == 3 / 5


def test_score_correctness_sends_reference_answer_to_the_judge():
    client = _FakeClient("5")

    score_correctness("q", "the reference answer", "the system's answer", client=client, model="claude-haiku-4-5")

    sent = client.messages.calls[0]["messages"][0]["content"]
    assert "the reference answer" in sent
    assert "the system's answer" in sent


def test_score_handles_a_non_numeric_reply_without_raising():
    client = _FakeClient("I cannot answer that")

    score = score_faithfulness("context", "answer", client=client, model="claude-haiku-4-5")

    assert score == 0.0


def test_score_clamps_an_out_of_range_digit():
    # the prompt only ever asks for 1-5, but a misbehaving model reply
    # containing e.g. "9" should clamp rather than produce a >1.0 score
    client = _FakeClient("9")

    score = score_relevance("q", "a", client=client, model="claude-haiku-4-5")

    assert score == 1.0
