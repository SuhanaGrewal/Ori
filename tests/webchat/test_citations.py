from meridian.webchat.citations import cited_chunks


def test_cited_chunks_filters_to_only_bracket_numbers_actually_used():
    # real bug: an answer citing only [1] still returned all 5 retrieved
    # chunks as citations, including a completely unrelated item that
    # happened to be in the rerank pool but was never referenced.
    chunks = ["chunk-1", "chunk-2", "chunk-3"]

    result = cited_chunks("The answer is X [1]. Also related: Y [1][2].", chunks)

    assert result == ["chunk-1", "chunk-2"]


def test_cited_chunks_falls_back_to_full_pool_when_nothing_cited():
    # e.g. retrieval-only mode with no LLM configured - there's no bracket
    # citation to parse at all, so showing every retrieved chunk is the
    # only sensible fallback rather than silently returning zero sources.
    chunks = ["chunk-1", "chunk-2"]

    result = cited_chunks("LLM not configured - showing retrieval only.", chunks)

    assert result == chunks


def test_cited_chunks_ignores_duplicate_and_out_of_range_markers():
    chunks = ["chunk-1", "chunk-2"]

    result = cited_chunks("cites [1] and [1] again, plus a bogus [9]", chunks)

    assert result == ["chunk-1"]


def test_cited_chunks_empty_pool_returns_empty():
    assert cited_chunks("some text [1]", []) == []
