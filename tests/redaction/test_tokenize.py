from dataclasses import dataclass

from meridian.redaction.custom_recognizers import Span
from meridian.redaction.tokenize import (
    TokenizationResult,
    _resolve_overlaps,
    _spans_overlap,
    tokenize_for_external_call,
    untokenize,
)


class _FakeAnalyzer:
    def __init__(self, results):
        self._results = results

    def analyze(self, *, text, entities, language):
        return self._results


@dataclass(frozen=True)
class _ScoredSpan:
    """mimics a real presidio RecognizerResult, which (unlike our own Span
    dataclass) always carries a confidence score."""

    entity_type: str
    start: int
    end: int
    score: float


def test_tokenization_result_holds_fields():
    result = TokenizationResult(
        tokenized_text="hi <PERSON_1>",
        mapping={"<PERSON_1>": "John"},
        entity_counts={"PERSON": 1},
    )

    assert result.tokenized_text == "hi <PERSON_1>"
    assert result.mapping == {"<PERSON_1>": "John"}
    assert result.entity_counts == {"PERSON": 1}


def test_spans_overlap_true_for_overlapping_ranges():
    a = Span(entity_type="A", start=0, end=10)
    b = Span(entity_type="B", start=5, end=15)

    assert _spans_overlap(a, b) is True


def test_spans_overlap_false_for_disjoint_ranges():
    a = Span(entity_type="A", start=0, end=5)
    b = Span(entity_type="B", start=5, end=10)

    assert _spans_overlap(a, b) is False


def test_resolve_overlaps_keeps_non_overlapping_spans():
    presidio_span = _ScoredSpan(entity_type="PERSON", start=0, end=4, score=0.9)
    custom_span = Span(entity_type="HOME_ADDRESS", start=10, end=20)

    resolved = _resolve_overlaps([presidio_span, custom_span])

    assert set(resolved) == {presidio_span, custom_span}


def test_resolve_overlaps_drops_overlapping_custom_span_in_favor_of_presidio():
    presidio_span = _ScoredSpan(entity_type="PERSON", start=0, end=10, score=0.9)
    custom_span = Span(entity_type="HOME_ADDRESS", start=5, end=15)

    resolved = _resolve_overlaps([presidio_span, custom_span])

    assert resolved == [presidio_span]


def test_resolve_overlaps_keeps_highest_scoring_presidio_span():
    # reproduces a real observed case: a credit card number also weakly
    # matched us_bank_number and us_driver_license patterns, all overlapping
    strong = _ScoredSpan(entity_type="CREDIT_CARD", start=10, end=26, score=1.0)
    weak_1 = _ScoredSpan(entity_type="US_BANK_NUMBER", start=10, end=26, score=0.05)
    weak_2 = _ScoredSpan(entity_type="US_DRIVER_LICENSE", start=10, end=26, score=0.01)

    resolved = _resolve_overlaps([weak_1, weak_2, strong])

    assert resolved == [strong]


def test_tokenize_reversible_entity_gets_numbered_placeholder():
    text = "Hi John, nice to meet you"
    analyzer = _FakeAnalyzer([Span(entity_type="PERSON", start=3, end=7)])

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "Hi <PERSON_1>, nice to meet you"
    assert result.mapping == {"<PERSON_1>": "John"}
    assert result.entity_counts == {"PERSON": 1}


def test_tokenize_numbers_multiple_same_type_entities_left_to_right():
    text = "John met Mary"
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=0, end=4),
            Span(entity_type="PERSON", start=9, end=13),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "<PERSON_1> met <PERSON_2>"
    assert result.mapping == {"<PERSON_1>": "John", "<PERSON_2>": "Mary"}
    assert result.entity_counts == {"PERSON": 2}


def test_tokenize_reuses_placeholder_for_identical_repeated_value():
    # regression test: the same real name appearing more than once (e.g.
    # as an email sender, then again in the user's own question) used to
    # get a fresh, unrelated placeholder number each time - so the model
    # had no way to know <PERSON_1> and <PERSON_3> were the same person,
    # and could wrongly claim someone "isn't mentioned anywhere" despite
    # being the sender of the very email cited as a source. Confirmed via
    # real testing: "what's my history with Billy Wardrop" failed this way
    # until placeholders were deduped by exact value.
    text = "Billy Wardrop wrote to you. Reply to Billy Wardrop soon."
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=0, end=13),
            Span(entity_type="PERSON", start=37, end=50),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "<PERSON_1> wrote to you. Reply to <PERSON_1> soon."
    assert result.mapping == {"<PERSON_1>": "Billy Wardrop"}


def test_tokenize_repeated_value_still_counts_every_occurrence_in_entity_counts():
    text = "Billy Wardrop wrote to you. Reply to Billy Wardrop soon."
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=0, end=13),
            Span(entity_type="PERSON", start=37, end=50),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.entity_counts == {"PERSON": 2}


def test_tokenize_reuses_placeholder_across_case_difference():
    # real bug, reproduced 3 separate ways via live CEO-persona testing:
    # a casually-typed lowercase question ("billy wardrop") and a formal
    # email header's capitalized sender ("Billy Wardrop") were getting
    # DIFFERENT placeholder numbers purely from casing, exactly the
    # "two unrelated people" failure test_tokenize_reuses_placeholder_
    # for_identical_repeated_value already fixed for exact duplicates -
    # this is the same bug, just triggered by case rather than an exact
    # match. The model then denied the lowercase mention was in its
    # context while citing the capitalized one as a completely separate
    # person - self-contradicting in the same response. Confirmed
    # end-to-end with the real presidio analyzer before this fix (both
    # "billy wardrop" and "Billy Wardrop" ARE detected as PERSON spans
    # regardless of case - the bug was purely in placeholder assignment,
    # not entity detection).
    #
    # The stored mapping value must be the properly-cased "Billy Wardrop",
    # not the lowercase question text - found via a second real bug this
    # same fix introduced initially (storing whichever occurrence is
    # leftmost): build_user_message always puts the question before the
    # numbered context blocks, so a question that itself names the person
    # is always leftmost, and untokenize() rendered every occurrence -
    # including ones quoted from the properly-capitalized source email -
    # in the user's own casual lowercase.
    text = "who is billy wardrop\n\nfrom: Billy Wardrop"
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=7, end=20),
            Span(entity_type="PERSON", start=28, end=41),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "who is <PERSON_1>\n\nfrom: <PERSON_1>"
    assert result.mapping == {"<PERSON_1>": "Billy Wardrop"}


def test_tokenize_reuses_placeholder_across_case_difference_for_email_address():
    # same bug, confirmed a second way in real testing: a lowercase email
    # address in the question vs. the capitalized address in the actual
    # message header. Stored value must be the properly-cased address.
    text = "anything from billy.wardrop@ed.ac.uk\n\nfrom: Billy.Wardrop@ed.ac.uk"
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="EMAIL_ADDRESS", start=14, end=36),
            Span(entity_type="EMAIL_ADDRESS", start=44, end=66),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == (
        "anything from <EMAIL_ADDRESS_1>\n\nfrom: <EMAIL_ADDRESS_1>"
    )
    assert result.mapping == {"<EMAIL_ADDRESS_1>": "Billy.Wardrop@ed.ac.uk"}


def test_tokenize_keeps_properly_cased_value_when_it_occurs_first():
    # order independence: when the properly-cased occurrence comes first
    # and a lowercase one follows, the canonical value should still be
    # the properly-cased form (not overwritten by the later lowercase
    # occurrence).
    text = "from: Billy Wardrop\n\nwho is billy wardrop"
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=6, end=19),
            Span(entity_type="PERSON", start=28, end=41),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.mapping == {"<PERSON_1>": "Billy Wardrop"}


def test_tokenize_distinct_values_of_same_type_still_get_separate_placeholders():
    text = "Billy Wardrop met Billy Smith"
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=0, end=13),
            Span(entity_type="PERSON", start=18, end=29),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "<PERSON_1> met <PERSON_2>"
    assert result.mapping == {"<PERSON_1>": "Billy Wardrop", "<PERSON_2>": "Billy Smith"}


def test_tokenize_consumes_wrapping_brackets_in_email_header_format():
    # real bug, found by reconstructing the exact tokenized text sent to
    # the model for a live failing question: an email header's "Name
    # <email@domain>" format left the placeholder NESTED inside the
    # original literal brackets - "Billy Wardrop <<EMAIL_ADDRESS_1>>" -
    # since only the inner address substring (not the surrounding "<"/">")
    # was ever part of the matched span. That nested-bracket mangling was
    # confusing enough that the model denied an email address was present
    # at all, despite it sitting right next to the person's own name and
    # being cited as a source. Fix: extend the span to consume immediately
    # -adjacent literal brackets, so the placeholder cleanly replaces the
    # whole "<email>" unit instead of nesting inside it.
    text = "From: Billy Wardrop <Billy.Wardrop@ed.ac.uk>"
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=6, end=19),
            Span(entity_type="EMAIL_ADDRESS", start=21, end=43),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "From: <PERSON_1> <EMAIL_ADDRESS_1>"
    assert result.mapping == {
        "<PERSON_1>": "Billy Wardrop",
        "<EMAIL_ADDRESS_1>": "Billy.Wardrop@ed.ac.uk",
    }


def test_tokenize_does_not_extend_over_brackets_that_are_not_adjacent():
    text = "email: Billy.Wardrop@ed.ac.uk (no brackets here)"
    analyzer = _FakeAnalyzer([Span(entity_type="EMAIL_ADDRESS", start=7, end=29)])

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "email: <EMAIL_ADDRESS_1> (no brackets here)"


def test_tokenize_dedupes_possessive_form_with_plain_name():
    # real bug, found by reconstructing the exact tokenized text sent to
    # the model for a live failing follow-up ("what is Billy Wardrop's
    # email address?"): presidio matched the whole "Billy Wardrop's"
    # (including the possessive suffix) as one PERSON span - a different
    # exact substring than an email header's plain "Billy Wardrop", so
    # even after the casefold fix for case differences, the two got
    # separate placeholders. The model then saw two unrelated people and
    # denied one had an email address while citing the other as the
    # source for it.
    text = "From: Billy Wardrop\n\nwhat is Billy Wardrop's email address?"
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=6, end=19),
            Span(entity_type="PERSON", start=29, end=44),  # "Billy Wardrop's", incl. suffix
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "From: <PERSON_1>\n\nwhat is <PERSON_1>'s email address?"
    assert result.mapping == {"<PERSON_1>": "Billy Wardrop"}


def test_tokenize_hard_secret_becomes_redacted_marker_not_in_mapping():
    text = "card: 4111111111111111"
    analyzer = _FakeAnalyzer([Span(entity_type="CREDIT_CARD", start=6, end=22)])

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "card: [REDACTED]"
    assert result.mapping == {}
    assert result.entity_counts == {"CREDIT_CARD": 1}


def test_tokenize_empty_text_returns_empty_result_without_calling_analyzer():
    class _ExplodingAnalyzer:
        def analyze(self, **kwargs):
            raise AssertionError("should not be called for empty text")

    result = tokenize_for_external_call("", analyzer=_ExplodingAnalyzer())

    assert result == TokenizationResult(tokenized_text="", mapping={}, entity_counts={})


def test_tokenize_does_not_corrupt_text_when_presidio_spans_overlap():
    # regression test: presidio can return multiple overlapping matches for
    # the same substring (e.g. a credit card number also weakly matching
    # us_bank_number/us_driver_license) - processing all of them used to
    # slice the string using stale offsets and silently drop trailing text.
    text = "my card is 4111111111111111 done"
    analyzer = _FakeAnalyzer(
        [
            _ScoredSpan(entity_type="CREDIT_CARD", start=11, end=27, score=1.0),
            _ScoredSpan(entity_type="US_BANK_NUMBER", start=11, end=27, score=0.05),
            _ScoredSpan(entity_type="US_DRIVER_LICENSE", start=11, end=27, score=0.01),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert result.tokenized_text == "my card is [REDACTED] done"
    assert result.entity_counts == {"CREDIT_CARD": 1}


def test_tokenize_includes_custom_address_and_secret_spans():
    text = "ship to 123 Main St, key: sk-abcdefghijklmnopqrstuvwxyz123456"
    analyzer = _FakeAnalyzer([])

    result = tokenize_for_external_call(text, analyzer=analyzer)

    assert "<HOME_ADDRESS_1>" in result.tokenized_text
    assert "[REDACTED]" in result.tokenized_text
    assert result.mapping == {"<HOME_ADDRESS_1>": "123 Main St"}
    assert result.entity_counts == {"HOME_ADDRESS": 1, "API_KEY_OR_PASSWORD": 1}


def test_tokenize_logs_entity_counts_without_raw_values():
    logged = {}

    class _RecordingLogger:
        def info(self, message, extra=None):
            logged["extra"] = extra

    text = "Hi John"
    analyzer = _FakeAnalyzer([Span(entity_type="PERSON", start=3, end=7)])

    tokenize_for_external_call(text, analyzer=analyzer, logger=_RecordingLogger())

    assert logged["extra"]["entity_counts"] == {"PERSON": 1}
    assert "John" not in str(logged["extra"])


def test_untokenize_restores_reversible_values():
    tokenized = "Hi <PERSON_1>, nice to meet you"

    restored = untokenize(tokenized, {"<PERSON_1>": "John"})

    assert restored == "Hi John, nice to meet you"


def test_untokenize_round_trips_with_tokenize_for_reversible_only_text():
    text = "John met Mary at the office"
    analyzer = _FakeAnalyzer(
        [
            Span(entity_type="PERSON", start=0, end=4),
            Span(entity_type="PERSON", start=9, end=13),
        ]
    )

    result = tokenize_for_external_call(text, analyzer=analyzer)
    restored = untokenize(result.tokenized_text, result.mapping)

    assert restored == text


def test_untokenize_cannot_restore_a_hard_secret():
    text = "card: 4111111111111111"
    analyzer = _FakeAnalyzer([Span(entity_type="CREDIT_CARD", start=6, end=22)])

    result = tokenize_for_external_call(text, analyzer=analyzer)
    restored = untokenize(result.tokenized_text, result.mapping)

    assert restored == "card: [REDACTED]"
    assert "4111111111111111" not in restored


def test_untokenize_with_empty_mapping_returns_text_unchanged():
    assert untokenize("no placeholders here", {}) == "no placeholders here"
