from __future__ import annotations

import re
from typing import Any

_CITATION_MARKER = re.compile(r"\[(\d+)\]")


def chunk_to_citation(chunk: Any) -> dict[str, str]:
    """{label, detail} matching the frontend's citation-pill shape -
    label is a short source identifier, detail the fuller description.
    Deliberately built here rather than reusing query/prompt.py's private
    _source_label() as-is, since that produces one combined string and
    the frontend wants the short/full split into two fields."""
    metadata = chunk.metadata
    if chunk.source == "gmail":
        return {"label": metadata.get("sender", "Email"), "detail": metadata.get("subject", "")}
    if chunk.source == "calendar":
        return {"label": metadata.get("summary", "Calendar event"), "detail": metadata.get("start_at", "")}
    if chunk.source == "docs":
        return {"label": metadata.get("title", "Document"), "detail": "Google Doc"}
    if chunk.source == "local_files":
        return {"label": metadata.get("path", "Note"), "detail": "Local note"}
    return {"label": chunk.source, "detail": ""}


def cited_chunks(answer_text: str, chunks: list[Any], *, fallback_to_full_pool: bool = True) -> list[Any]:
    """narrows the full retrieved pool down to only the chunks the answer
    actually cited by bracket number, e.g. "[1]" or "[1][2]" - found live:
    a question with several similarly-worded real candidates (three
    separate Anthropic receipts) got answered correctly and cited only
    [1], but the API still returned all 5 retrieved chunks as citations,
    including a completely unrelated British Airways e-ticket that
    happened to be in the rerank pool but was never actually referenced.
    query/prompt.py's own format_sources() deliberately lists the full
    pool for the CLI (see its docstring and
    test_ask_generates_answer_and_untokenizes_placeholders_back) - that
    stays unchanged. This only narrows what the webchat JSON API's
    citation pills show, since showing an uncited, unrelated item as a
    "source" is actively misleading in a UI that presents citations as
    exactly where an answer came from.

    fallback_to_full_pool controls what "cited nothing by number" means -
    true for retrieval-only mode (no LLM configured, so the "answer" is
    just the raw candidates being displayed, not a claim to check against
    them). Callers with a REAL generated answer should pass False: an
    uncited real answer is exactly how the model looks when it correctly
    reviews low-confidence candidates and says none of them are relevant
    (found live: "whats up w wix" retrieved unrelated emails, the model
    correctly said "the context doesn't mention Wix at all", but the old
    unconditional fallback still showed those unrelated emails as
    "citations" for that denial) - showing the full pool there is
    actively wrong, not a safe default."""
    cited_numbers = {int(n) for n in _CITATION_MARKER.findall(answer_text)}
    if not cited_numbers:
        return chunks if fallback_to_full_pool else []
    return [chunk for i, chunk in enumerate(chunks, start=1) if i in cited_numbers]
