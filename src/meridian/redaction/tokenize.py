from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from meridian.redaction.custom_recognizers import find_address_spans, find_secret_spans
from meridian.redaction.entities import HARD_SECRET_ENTITIES, PRESIDIO_ENTITIES


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
    counters: dict[str, int] = {}
    value_to_idx: dict[tuple[str, str], int] = {}
    labeled: list[tuple[Any, int | None]] = []
    for span in sorted(spans, key=lambda s: s.start):
        if span.entity_type in HARD_SECRET_ENTITIES:
            labeled.append((span, None))
            continue
        # casefold, not the raw substring: the same real person/email
        # written in different casing (a formal email header's "Billy
        # Wardrop" vs. a casually-typed question's "billy wardrop") is
        # still the same entity - confirmed via real testing this was
        # getting two different placeholder numbers, so the model saw two
        # unrelated people and could deny one was mentioned while citing
        # the other as a source for the exact same person. The mapping
        # still stores whichever occurrence's exact casing was leftmost in
        # the text (same behavior already used for identical-value dedup
        # above), so untokenize() restores real, correctly-cased text -
        # just not necessarily matching every occurrence's own original
        # casing, an acceptable cosmetic tradeoff for not fragmenting one
        # person's identity across multiple placeholders.
        value_key = (span.entity_type, text[span.start : span.end].casefold())
        if value_key in value_to_idx:
            idx = value_to_idx[value_key]
        else:
            counters[span.entity_type] = counters.get(span.entity_type, 0) + 1
            idx = counters[span.entity_type]
            value_to_idx[value_key] = idx
        labeled.append((span, idx))

    mapping: dict[str, str] = {}
    entity_counts: dict[str, int] = {}
    tokenized = text
    for span, idx in sorted(labeled, key=lambda item: item[0].start, reverse=True):
        entity_counts[span.entity_type] = entity_counts.get(span.entity_type, 0) + 1
        if idx is None:
            replacement = "[REDACTED]"
        else:
            placeholder = f"<{span.entity_type}_{idx}>"
            mapping[placeholder] = text[span.start : span.end]
            replacement = placeholder
        tokenized = tokenized[: span.start] + replacement + tokenized[span.end :]

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
