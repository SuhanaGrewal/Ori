from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from ori.redaction.custom_recognizers import find_address_spans, find_secret_spans
from ori.redaction.entities import HARD_SECRET_ENTITIES, PRESIDIO_ENTITIES


@dataclass(frozen=True)
class TokenizationResult:
    tokenized_text: str
    mapping: dict[str, str]
    entity_counts: dict[str, int]


def _spans_overlap(a: Any, b: Any) -> bool:
    return a.start < b.end and b.start < a.end


def _span_priority(span: Any) -> float:
    # custom regex spans have no confidence score - treat them as lower
    # priority than any real presidio match, but they're still considered
    # when they don't overlap a presidio result at all.
    return getattr(span, "score", -1.0)


_POSSESSIVE_SUFFIXES = ("'s", "’s")


def _trim_trailing_possessive(text: str, start: int, end: int) -> tuple[int, int]:
    """trims a trailing possessive "'s" (straight or curly apostrophe)
    from a detected span, e.g. presidio matching the whole "Billy
    Wardrop's" in a follow-up question like "what is Billy Wardrop's
    email address" as one PERSON span. Left untrimmed, this is a
    different exact substring than the plain "Billy Wardrop" an email
    header uses, so - even after the casefold fix for case differences -
    the two get separate placeholders and the model sees two unrelated
    people, denying one has an email address while citing the other as
    the source for it. Confirmed via real testing: reconstructing the
    exact tokenized text sent to the model for a live failing follow-up
    question showed exactly this ("<PERSON_2>" for "Billy Wardrop's" vs
    "<PERSON_1>" for the header's plain "Billy Wardrop"). Trimming only
    the span (not the substituted text) leaves the possessive suffix as
    plain text right after the placeholder, so "Billy Wardrop's" still
    reads correctly as "<PERSON_1>'s" once tokenized."""
    for suffix in _POSSESSIVE_SUFFIXES:
        if text[start:end].endswith(suffix):
            return start, end - len(suffix)
    return start, end


def _extend_over_wrapping_brackets(text: str, start: int, end: int) -> tuple[int, int]:
    """extends a span to consume immediately-surrounding literal '<'/'>'
    characters - a real, extremely common email convention ("Name
    <email@domain>" in From/To headers). Without this, replacing just the
    inner value nests the placeholder's OWN angle-bracket syntax inside
    the real ones: "Billy Wardrop <<EMAIL_ADDRESS_1>>" instead of a clean
    "Billy Wardrop <EMAIL_ADDRESS_1>" - confirmed via real testing (traced
    the exact tokenized text sent to the model, not guessed) that this
    nested-bracket mangling was confusing enough that the model failed to
    recognize an email address sitting directly next to a person's name
    in a header as belonging to them, and denied the address was present
    at all despite citing it. Only the immediately-adjacent single
    brackets are consumed (not e.g. a further-nested "<mailto:...>" a few
    characters later), so a deeply-nested quoted-reply chain may still
    have some residual bracket noise - a smaller remaining edge case,
    not one this fix claims to fully resolve."""
    if start > 0 and text[start - 1] == "<" and end < len(text) and text[end] == ">":
        return start - 1, end + 1
    return start, end


def _resolve_overlaps(spans: list[Any]) -> list[Any]:
    """resolves overlapping spans - presidio itself can return multiple
    recognizers matching the same text (e.g. a credit card number also
    weakly matching a bank-number or driver's-license pattern), and a
    custom regex span can overlap a presidio span too. keeping every
    overlapping span would slice and replace the same text more than once
    using stale offsets, corrupting the output - so only the
    highest-priority span in each overlapping cluster survives."""
    ordered = sorted(spans, key=_span_priority, reverse=True)
    resolved: list[Any] = []
    for span in ordered:
        if not any(_spans_overlap(span, existing) for existing in resolved):
            resolved.append(span)
    return resolved


def tokenize_for_external_call(
    text: str, *, analyzer: Any, logger: logging.Logger | None = None
) -> TokenizationResult:
    """detects sensitive spans and replaces them with placeholders.

    reversible entities (people, emails, phone numbers, addresses) get a
    unique numbered placeholder recorded in the returned mapping, so the
    caller can substitute real values back into a response. hard secrets
    (credit cards, government ids, api keys, etc.) become a fixed
    "[REDACTED]" marker and are never added to the mapping - there is no
    way for those values to reappear.

    call this immediately before an external api call; the mapping should
    live only as long as that one call and never be persisted.
    """
    if not text:
        return TokenizationResult(tokenized_text=text, mapping={}, entity_counts={})

    start = time.monotonic()
    presidio_spans = analyzer.analyze(text=text, entities=list(PRESIDIO_ENTITIES), language="en")
    custom_spans = find_secret_spans(text) + find_address_spans(text)
    spans = _resolve_overlaps(presidio_spans + custom_spans)

    # number reversible placeholders in left-to-right reading order, before
    # substituting right-to-left (so earlier offsets stay valid as we go).
    # the SAME exact value (e.g. "Billy Wardrop" appearing as both an
    # email sender and later in a question) reuses its earlier placeholder
    # number rather than getting a new one - without this, the model sees
    # <PERSON_1> and <PERSON_3> as two different, unrelated people even
    # though they're the same real name, making it unable to answer any
    # question that requires recognizing the same entity mentioned more
    # than once (confirmed via real testing: "what's my history with X"
    # incorrectly claimed X wasn't mentioned anywhere, despite X being the
    # sender of the very emails cited as sources - X's name in the
    # question and X's name as a sender had been given different,
    # unrelated placeholder numbers). Matching is exact-substring only
    # (not fuzzy/partial name matching) to stay conservative - "Billy" and
    # "Billy Wardrop" still get separate placeholders, which is a real but
    # much smaller remaining gap than assigning no shared identity at all.
    #
    # casefold, not the raw substring, for the dedup key itself: the same
    # real person/email written in different casing (a formal email
    # header's "Billy Wardrop" vs. a casually-typed question's "billy
    # wardrop") is still the same entity. Which exact casing gets stored
    # for that shared placeholder is a separate decision - prefer a
    # non-lowercase occurrence (the formal source spelling) over an
    # all-lowercase one (a casually-typed question) - confirmed via real
    # testing that "leftmost occurrence wins" put the question's own
    # lowercase text in the mapping whenever the question mentioned the
    # entity itself, since build_user_message always puts the question
    # before the numbered context blocks - so untokenize() rendered every
    # occurrence of a real proper name in lowercase, including the ones
    # quoted from a properly-capitalized source. Leftmost is still the
    # tiebreak when neither or both occurrences are all-lowercase, for
    # stable, deterministic output.
    counters: dict[str, int] = {}
    value_to_idx: dict[tuple[str, str], int] = {}
    canonical_text: dict[tuple[str, int], str] = {}
    labeled: list[tuple[int, int, str, int | None]] = []
    for span in sorted(spans, key=lambda s: s.start):
        match_start, match_end = _trim_trailing_possessive(text, span.start, span.end)
        sub_start, sub_end = _extend_over_wrapping_brackets(text, match_start, match_end)
        if span.entity_type in HARD_SECRET_ENTITIES:
            labeled.append((sub_start, sub_end, span.entity_type, None))
            continue
        exact_text = text[match_start:match_end]
        value_key = (span.entity_type, exact_text.casefold())
        if value_key in value_to_idx:
            idx = value_to_idx[value_key]
            canonical_key = (span.entity_type, idx)
            if canonical_text[canonical_key].islower() and not exact_text.islower():
                canonical_text[canonical_key] = exact_text
        else:
            counters[span.entity_type] = counters.get(span.entity_type, 0) + 1
            idx = counters[span.entity_type]
            value_to_idx[value_key] = idx
            canonical_text[(span.entity_type, idx)] = exact_text
        labeled.append((sub_start, sub_end, span.entity_type, idx))

    mapping: dict[str, str] = {}
    entity_counts: dict[str, int] = {}
    tokenized = text
    for sub_start, sub_end, entity_type, idx in sorted(labeled, key=lambda item: item[0], reverse=True):
        entity_counts[entity_type] = entity_counts.get(entity_type, 0) + 1
        if idx is None:
            replacement = "[REDACTED]"
        else:
            placeholder = f"<{entity_type}_{idx}>"
            mapping[placeholder] = canonical_text[(entity_type, idx)]
            replacement = placeholder
        tokenized = tokenized[:sub_start] + replacement + tokenized[sub_end:]

    if logger is not None:
        logger.info(
            "redaction tokenization complete",
            extra={
                "operation": "redaction.tokenize",
                "status": "success",
                "duration_ms": round((time.monotonic() - start) * 1000, 2),
                "entity_counts": entity_counts,
                "total_entities": sum(entity_counts.values()),
            },
        )

    return TokenizationResult(tokenized_text=tokenized, mapping=mapping, entity_counts=entity_counts)


def untokenize(text: str, mapping: dict[str, str]) -> str:
    """substitutes placeholders back to their real values.

    call this once on an external response, before it's returned or saved
    anywhere, then let the mapping go out of scope - it should never be
    persisted. a hard-secret marker ("[REDACTED]") has no mapping entry by
    design and is never restored.
    """
    for placeholder, original_value in mapping.items():
        text = text.replace(placeholder, original_value)
    return text
