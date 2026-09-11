from __future__ import annotations

import math
import re


def precision_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    top = retrieved[:k]
    if not top:
        return 0.0
    return sum(1 for item in top if item in relevant) / len(top)


def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return 0.0
    return len(set(retrieved[:k]) & relevant) / len(relevant)


def reciprocal_rank(retrieved: list[str], relevant: set[str]) -> float:
    for rank, item in enumerate(retrieved, start=1):
        if item in relevant:
            return 1.0 / rank
    return 0.0


def hit_rate_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    """binary "did we find anything useful at all" - 1.0 if any relevant
    item appears in the top k, 0.0 otherwise. Coarser than recall (which
    cares how MANY relevant items were found), useful for questions with
    just one right answer where recall and hit rate would be identical
    and hit rate reads more plainly."""
    if not relevant:
        return 0.0
    return 1.0 if set(retrieved[:k]) & relevant else 0.0


def ndcg_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    """normalized discounted cumulative gain with binary relevance (a
    chunk is either relevant or it isn't, no graded relevance scores) -
    rewards relevant results ranked higher more than the same results
    ranked lower, unlike recall/precision which don't care about order
    within the top k at all. Normalized against the best possible
    ordering (all relevant items first) so the score is always 0-1
    regardless of how many relevant items exist for a given question."""
    if not relevant:
        return 0.0
    dcg = sum(1.0 / math.log2(rank + 1) for rank, item in enumerate(retrieved[:k], start=1) if item in relevant)
    ideal_hits = min(len(relevant), k)
    idcg = sum(1.0 / math.log2(rank + 1) for rank in range(1, ideal_hits + 1))
    return dcg / idcg if idcg > 0 else 0.0


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def extract_citation_indices(answer: str) -> list[int]:
    """order-preserving, duplicates kept - pulls every [N] out of prose."""
    return [int(n) for n in re.findall(r"\[(\d+)\]", answer)]
