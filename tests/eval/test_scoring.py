from tests.eval.scoring import (
    extract_citation_indices,
    hit_rate_at_k,
    mean,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
    reciprocal_rank,
)


def test_precision_at_k_all_relevant():
    assert precision_at_k(["a", "b"], {"a", "b"}, 2) == 1.0


def test_precision_at_k_partial_match():
    assert precision_at_k(["a", "b", "c"], {"a"}, 3) == 1 / 3


def test_precision_at_k_no_matches():
    assert precision_at_k(["a", "b"], {"z"}, 2) == 0.0


def test_precision_at_k_empty_retrieved():
    assert precision_at_k([], {"a"}, 5) == 0.0


def test_precision_at_k_smaller_than_k_uses_actual_length():
    assert precision_at_k(["a"], {"a"}, 5) == 1.0


def test_recall_at_k_all_relevant_found():
    assert recall_at_k(["a", "b", "c"], {"a", "b"}, 3) == 1.0


def test_recall_at_k_partial_match():
    assert recall_at_k(["a"], {"a", "b"}, 3) == 0.5


def test_recall_at_k_no_relevant_docs():
    assert recall_at_k(["a", "b"], set(), 3) == 0.0


def test_recall_at_k_cutoff_excludes_later_hits():
    assert recall_at_k(["z", "a"], {"a"}, 1) == 0.0


def test_reciprocal_rank_hit_at_first_position():
    assert reciprocal_rank(["a", "b"], {"a"}) == 1.0


def test_reciprocal_rank_hit_at_third_position():
    assert reciprocal_rank(["x", "y", "a"], {"a"}) == 1 / 3


def test_reciprocal_rank_no_hit():
    assert reciprocal_rank(["x", "y"], {"a"}) == 0.0


def test_mean_of_values():
    assert mean([1.0, 0.5, 0.0]) == 0.5


def test_mean_of_empty_list():
    assert mean([]) == 0.0


def test_extract_citation_indices_none_present():
    assert extract_citation_indices("no citations here") == []


def test_extract_citation_indices_single():
    assert extract_citation_indices("the budget grew[1].") == [1]


def test_extract_citation_indices_multiple_and_repeated():
    assert extract_citation_indices("a[1][2], and again[1].") == [1, 2, 1]


def test_extract_citation_indices_ignores_non_numeric_brackets():
    assert extract_citation_indices("see [note] and [3].") == [3]


def test_hit_rate_at_k_any_relevant_present():
    assert hit_rate_at_k(["z", "a", "y"], {"a", "b"}, 3) == 1.0


def test_hit_rate_at_k_no_relevant_present():
    assert hit_rate_at_k(["x", "y"], {"a"}, 2) == 0.0


def test_hit_rate_at_k_relevant_present_but_outside_cutoff():
    assert hit_rate_at_k(["z", "a"], {"a"}, 1) == 0.0


def test_hit_rate_at_k_no_relevant_docs_at_all():
    assert hit_rate_at_k(["a", "b"], set(), 2) == 0.0


def test_ndcg_at_k_perfect_ordering_scores_one():
    # both relevant docs ranked first - the best possible ordering, so
    # actual DCG should exactly equal ideal DCG
    assert ndcg_at_k(["a", "b", "z"], {"a", "b"}, 3) == 1.0


def test_ndcg_at_k_relevant_doc_ranked_lower_scores_less_than_one():
    # single relevant doc at rank 2 instead of rank 1 - same recall as a
    # perfect ordering would give, but NDCG penalizes the worse rank
    score = ndcg_at_k(["z", "a"], {"a"}, 2)
    assert 0.0 < score < 1.0


def test_ndcg_at_k_no_relevant_found_scores_zero():
    assert ndcg_at_k(["x", "y"], {"a"}, 2) == 0.0


def test_ndcg_at_k_no_relevant_docs_at_all():
    assert ndcg_at_k(["a", "b"], set(), 2) == 0.0


def test_ndcg_at_k_order_independent_when_all_relevant_found_within_k():
    # a case NDCG and recall would disagree on if graded relevance were
    # in play, but with binary relevance and both hits inside the same
    # cutoff, order between two relevant docs doesn't change the score
    assert ndcg_at_k(["a", "b"], {"a", "b"}, 2) == ndcg_at_k(["b", "a"], {"a", "b"}, 2)
