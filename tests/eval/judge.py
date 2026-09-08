from __future__ import annotations

from typing import Any

from ori.query.anthropic_client import call_claude

# Generation-quality metrics that have no deterministic ground truth to
# compare against (unlike retrieval's chunk-id-based precision/recall) -
# LLM-as-a-judge is the standard fallback per the RAG eval framework this
# module implements: faithfulness (grounded in context, no hallucination),
# answer relevance (actually addresses the question), completeness
# (includes what the context has that the question needs), and
# correctness (matches a known reference answer, when one exists - the
# end-to-end metric). Each judge call is a single, cheap, narrowly-scoped
# question so the model has one clear thing to grade rather than several
# at once diluting its attention.

_SCORE_SCALE = 5

FAITHFULNESS_SYSTEM_PROMPT = (
    "You are evaluating a RAG (retrieval-augmented generation) system. "
    "Given CONTEXT (the source material the system was allowed to use) "
    "and an ANSWER (what the system actually said), judge whether every "
    "factual claim in the answer is genuinely supported by the context - "
    "not whether the answer is well-written or complete, only whether it "
    "invents or embellishes anything not actually present in the context. "
    "Respond with ONLY a single digit from 1 to 5: "
    "5 = every claim is directly supported by the context, "
    "3 = mostly supported but with at least one unsupported or embellished "
    "detail, 1 = substantially fabricated or contradicts the context. "
    "No explanation, just the digit."
)

RELEVANCE_SYSTEM_PROMPT = (
    "You are evaluating a RAG system. Given a QUESTION and an ANSWER, "
    "judge whether the answer actually addresses what was asked - not "
    "whether it's factually correct or complete, only whether it's "
    "on-topic and responsive to the specific question. An answer that "
    "correctly says the information isn't available still counts as "
    "relevant if the question was genuinely about that information. "
    "Respond with ONLY a single digit from 1 to 5: "
    "5 = directly and fully addresses the question, "
    "3 = partially addresses it or is somewhat off-topic, "
    "1 = does not address the question at all. No explanation, just the digit."
)

COMPLETENESS_SYSTEM_PROMPT = (
    "You are evaluating a RAG system. Given a QUESTION, the CONTEXT the "
    "system had available, and its ANSWER, judge whether the answer "
    "includes the important information from the context that's actually "
    "relevant to the question - not extra unrelated details from the "
    "context, just: did it leave out anything a user asking this specific "
    "question would need from what was available? Respond with ONLY a "
    "single digit from 1 to 5: 5 = fully complete, nothing relevant "
    "omitted, 3 = missing a secondary but non-critical detail, "
    "1 = missing most of the important relevant information. No "
    "explanation, just the digit."
)

CORRECTNESS_SYSTEM_PROMPT = (
    "You are evaluating a RAG system's end-to-end output against a known "
    "correct REFERENCE ANSWER. Given a QUESTION, the REFERENCE ANSWER, "
    "and the system's own ANSWER, judge whether the system's answer "
    "conveys the same essential facts as the reference - exact wording "
    "does not need to match. Respond with ONLY a single digit from 1 to "
    "5: 5 = fully correct, conveys the same essential facts, "
    "3 = partially correct or missing a key fact, "
    "1 = wrong or contradicts the reference. No explanation, just the digit."
)


def _parse_score(raw: str) -> float:
    digits = "".join(char for char in raw if char.isdigit())
    if not digits:
        return 0.0
    score = max(1, min(_SCORE_SCALE, int(digits[0])))
    return score / _SCORE_SCALE


def _judge(system_prompt: str, user_message: str, *, client: Any, model: str) -> float:
    raw = call_claude(client, model=model, system=system_prompt, user_message=user_message, max_tokens=5)
    return _parse_score(raw)


def score_faithfulness(context: str, answer: str, *, client: Any, model: str) -> float:
    return _judge(FAITHFULNESS_SYSTEM_PROMPT, f"CONTEXT:\n{context}\n\nANSWER:\n{answer}", client=client, model=model)


def score_relevance(question: str, answer: str, *, client: Any, model: str) -> float:
    return _judge(RELEVANCE_SYSTEM_PROMPT, f"QUESTION:\n{question}\n\nANSWER:\n{answer}", client=client, model=model)


def score_completeness(question: str, context: str, answer: str, *, client: Any, model: str) -> float:
    return _judge(
        COMPLETENESS_SYSTEM_PROMPT,
        f"QUESTION:\n{question}\n\nCONTEXT:\n{context}\n\nANSWER:\n{answer}",
        client=client, model=model,
    )


def score_correctness(question: str, reference_answer: str, answer: str, *, client: Any, model: str) -> float:
    return _judge(
        CORRECTNESS_SYSTEM_PROMPT,
        f"QUESTION:\n{question}\n\nREFERENCE ANSWER:\n{reference_answer}\n\nANSWER:\n{answer}",
        client=client, model=model,
    )
