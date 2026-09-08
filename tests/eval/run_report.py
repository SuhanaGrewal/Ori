"""Standalone RAG evaluation report - run with:

    .venv/bin/python -m tests.eval.run_report

Uses the REAL embedder, reranker, and (if LLM_API_KEY is set) real
Claude calls against the golden dataset - unlike test_retrieval_eval.py,
which deliberately uses fake, hand-scripted embeddings/reranker to test
the retrieval PIPELINE's own logic (dedup, date filtering, abstain,
recency tiebreak) fast and deterministically. This script instead
measures how good the actual production models are, per the three-layer
RAG eval framework: retrieval (precision/recall/hit-rate/NDCG/MRR - has
ground truth via the golden dataset's known relevant_chunk_ids),
generation (faithfulness/relevance/completeness via LLM-as-judge - no
ground truth needed, judged directly against the retrieved context), and
end-to-end abstain accuracy (does the system correctly recognize
genuinely irrelevant questions).

Retrieval metrics run regardless of LLM_API_KEY (no LLM calls needed).
Generation metrics are skipped without it, since scoring faithfulness/
relevance/completeness needs a real judge call - set LLM_API_KEY (and
optionally ORI_EVAL_GENERATION_LIMIT, default 6, to bound real API
cost/time) to include them.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import numpy as np

from ori.common.config import load_config
from ori.indexing.embedder import build_embedder, embed_chunks
from ori.indexing.store import IndexStore
from ori.query.anthropic_client import build_client
from ori.query.answer import ask
from ori.query.prompt import _source_label
from ori.query.reranker import build_reranker
from ori.query.retrieval import retrieve
from ori.redaction.analyzer import build_analyzer_engine
from tests.eval.golden_dataset import GOLDEN_DOCS, GOLDEN_QUESTIONS, build_golden_store
from tests.eval.judge import score_completeness, score_faithfulness, score_relevance
from tests.eval.scoring import hit_rate_at_k, mean, ndcg_at_k, precision_at_k, recall_at_k, reciprocal_rank


def _build_store(tmp_path: Path, embedder) -> IndexStore:
    store = IndexStore(tmp_path / "eval_index.db")
    doc_texts = [doc.text for doc in GOLDEN_DOCS]
    vectors = embed_chunks(embedder, doc_texts)
    vector_by_item_id = {doc.item_id: np.array(vectors[i], dtype=np.float32) for i, doc in enumerate(GOLDEN_DOCS)}
    build_golden_store(store, embed=lambda doc: vector_by_item_id[doc.item_id])
    return store


def run_retrieval_eval(store, embedder, reranker) -> None:
    print("\n=== Retrieval evaluation (real embedder + reranker) ===")
    non_abstain = [q for q in GOLDEN_QUESTIONS if not q.should_abstain]
    precisions, recalls, hits, ndcgs, ranks = [], [], [], [], []

    for question in non_abstain:
        query_embedding = np.array(embed_chunks(embedder, [question.question])[0], dtype=np.float32)
        # abstain_threshold=0.0 here on purpose: these metrics measure
        # whether the right chunks were found and ranked well at all,
        # independent of the production abstain policy - abstain
        # accuracy for questions that SHOULD abstain is checked
        # separately below, against the real default threshold.
        result = retrieve(
            store, question.question, query_embedding, reranker=reranker,
            source=question.source_filter, abstain_threshold=0.0,
        )
        retrieved_ids = [chunk.chunk_id for chunk in result.chunks]
        r = len(question.relevant_chunk_ids)
        precisions.append(precision_at_k(retrieved_ids, question.relevant_chunk_ids, r))
        recalls.append(recall_at_k(retrieved_ids, question.relevant_chunk_ids, 5))
        hits.append(hit_rate_at_k(retrieved_ids, question.relevant_chunk_ids, 5))
        ndcgs.append(ndcg_at_k(retrieved_ids, question.relevant_chunk_ids, 5))
        ranks.append(reciprocal_rank(retrieved_ids, question.relevant_chunk_ids))

    abstain_questions = [q for q in GOLDEN_QUESTIONS if q.should_abstain]
    correct_abstains = 0
    for question in abstain_questions:
        query_embedding = np.array(embed_chunks(embedder, [question.question])[0], dtype=np.float32)
        result = retrieve(store, question.question, query_embedding, reranker=reranker)
        if result.abstained:
            correct_abstains += 1

    print(f"  Questions evaluated (non-abstain): {len(non_abstain)}")
    print(f"  Precision@R (R = # relevant docs): {mean(precisions):.3f}")
    print(f"  Recall@5:                          {mean(recalls):.3f}")
    print(f"  Hit Rate@5:                        {mean(hits):.3f}")
    print(f"  NDCG@5:                             {mean(ndcgs):.3f}")
    print(f"  MRR:                                {mean(ranks):.3f}")
    print(f"  Abstain accuracy:                  {correct_abstains}/{len(abstain_questions)} correctly abstained")


def run_generation_eval(store, embedder, reranker, analyzer, client, model, *, limit: int) -> None:
    print(f"\n=== Generation evaluation (real LLM + LLM-as-judge, first {limit} questions) ===")
    non_abstain = [q for q in GOLDEN_QUESTIONS if not q.should_abstain][:limit]
    faithfulness, relevance, completeness = [], [], []

    for question in non_abstain:
        result = ask(
            question.question, store=store, embedder=embedder, reranker=reranker,
            analyzer=analyzer, client=client, model=model, source=question.source_filter,
        )
        if result.abstained or not result.answer:
            print(f"  [abstained - excluded from generation scores] {question.question!r}")
            continue
        # mirrors build_user_message()'s own per-chunk formatting (source
        # label + date, then the parent text) - judging faithfulness
        # against the bare parent_text alone was flagging real, correctly
        # grounded date claims (e.g. "May 15, 2024" from a calendar
        # event's start_at) as unsupported, since that date lives in the
        # chunk's metadata, not its text, and the answering model sees
        # both while the judge was only ever shown one.
        context = "\n\n".join(f"{_source_label(chunk)}\n{chunk.parent_text}" for chunk in result.chunks)
        f = score_faithfulness(context, result.answer, client=client, model=model)
        r = score_relevance(question.question, result.answer, client=client, model=model)
        c = score_completeness(question.question, context, result.answer, client=client, model=model)
        faithfulness.append(f)
        relevance.append(r)
        completeness.append(c)
        print(f"  {question.question!r} -> faithfulness={f:.2f} relevance={r:.2f} completeness={c:.2f}")

    if faithfulness:
        print(f"\n  Mean faithfulness:  {mean(faithfulness):.3f}")
        print(f"  Mean relevance:     {mean(relevance):.3f}")
        print(f"  Mean completeness:  {mean(completeness):.3f}")
    else:
        print("\n  Every sampled question abstained - no generation scores to report.")


def main() -> None:
    config = load_config()
    embedder = build_embedder()
    reranker = build_reranker()

    with tempfile.TemporaryDirectory() as tmp:
        store = _build_store(Path(tmp), embedder)
        run_retrieval_eval(store, embedder, reranker)

        if not config.llm_api_key:
            print("\nLLM_API_KEY not set - skipping generation evaluation (retrieval-only report).")
            return

        analyzer = build_analyzer_engine()
        client = build_client(config.llm_api_key)
        limit = int(os.environ.get("ORI_EVAL_GENERATION_LIMIT", "6"))
        run_generation_eval(store, embedder, reranker, analyzer, client, config.llm_model, limit=limit)


if __name__ == "__main__":
    main()
