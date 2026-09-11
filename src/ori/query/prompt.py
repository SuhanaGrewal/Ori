from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ori.query.date_range import parse_stored_date
from ori.query.retrieval import RetrievedChunk

# fixed constant, contains no user data - never tokenized before an
# external call, unlike the user message built from real retrieved content.
SYSTEM_PROMPT = (
    "You are a personal knowledge assistant. Answer the user's question using "
    "ONLY the numbered context blocks provided below the question - never rely "
    "on outside knowledge. After each claim, cite the bracket number(s) of the "
    "context block(s) it came from, like [1] or [1][2]. If the provided context "
    "does not contain enough information to answer, say so plainly instead of "
    "guessing.\n\n"
    "Each context block's own first line (showing an email's sender/subject, "
    "a calendar event's title, or a document's title) is itself part of the "
    "answerable information, not just a citation label - e.g. for a question "
    "about your history or correspondence with someone, check whether they "
    "appear as the sender there, not only whether their name is repeated "
    "again in the body text below it. Never claim a person or topic isn't "
    "mentioned when they actually appear in that first line.\n\n"
    "Dated items (emails, calendar events) are labeled with how long ago or "
    "from now they are, like \"(115 days ago)\" or \"(in 3 days)\" - trust "
    "that label directly rather than computing it yourself from today's date "
    "(also given at the top of the context). If the question implies the "
    "user wants something current or upcoming (e.g. \"what flights do I "
    "have,\" \"what's my next X\") and everything relevant is labeled \"ago\" "
    "(in the past), say plainly that there's nothing upcoming - don't present "
    "a past item as if it were still pending just because it's the most "
    "recent one found. You may still separately mention the most recent past "
    "item as context, making clear it has already happened.\n\n"
    "Some names, email addresses, phone numbers, and addresses in the context "
    "have been replaced with placeholders like <PERSON_1>, <EMAIL_ADDRESS_1>, "
    "<PHONE_NUMBER_1>, or <HOME_ADDRESS_1> to protect privacy. Treat these "
    "exactly like real names/emails/etc. in your answer - use them naturally in "
    "place of the real values, and do not comment on or explain the "
    "placeholders themselves.\n\n"
    "Write like a sharp assistant briefing someone busy, not a report. "
    "Skip preambles like \"Based on the context provided\" or \"Here's the "
    "status of X\" - answer directly, in a sentence or two wherever the "
    "content allows it. Bold (using **double asterisks**) the single most "
    "important concrete detail - a number, date, name, status, or amount - "
    "so it's scannable at a glance; don't bold whole sentences or more than "
    "a couple of details per answer.\n\n"
    "If a recent conversation is included below, a short follow-up "
    "question (e.g. \"and where?\", \"when?\") is almost always still "
    "about the SAME item the conversation was just discussing - stay "
    "scoped to that one item's own context block(s) rather than pulling "
    "in a different context block just because it shares a generic word "
    "(like \"delivery\" or \"payment\") with the follow-up. If that "
    "specific item's own context doesn't mention the thing being asked "
    "(a date, a location, etc.), say so plainly - e.g. \"the email about "
    "X doesn't mention a delivery date\" - instead of substituting an "
    "unrelated item's answer."
)


def _relative_days_label(date_str: str, now: datetime) -> str:
    """computed deterministically in code, not left for the model to work
    out - an llm asked to do date arithmetic against a "today's date" line
    is unreliable in practice (confirmed: it correctly called one past item
    "past" and incorrectly called another, equally past, item "upcoming" in
    the same response). Handing it the already-computed answer removes that
    failure mode entirely."""
    parsed = parse_stored_date(date_str)
    if parsed is None:
        return ""
    delta_days = (now - parsed).days
    if delta_days > 0:
        return f" ({delta_days} day{'s' if delta_days != 1 else ''} ago)"
    if delta_days < 0:
        future_days = -delta_days
        return f" (in {future_days} day{'s' if future_days != 1 else ''})"
    return " (today)"


def _source_label(chunk: RetrievedChunk, *, now: datetime | None = None) -> str:
    now = now if now is not None else datetime.now(tz=timezone.utc)
    metadata = chunk.metadata
    if chunk.source == "gmail":
        sent_at = metadata.get("sent_at", "")
        return (
            f"Gmail email from {metadata.get('sender', '')}, "
            f"sent {sent_at}{_relative_days_label(sent_at, now)}, "
            f"subject: '{metadata.get('subject', '')}'"
        )
    if chunk.source == "calendar":
        start_at = metadata.get("start_at", "")
        return (
            f"Calendar event '{metadata.get('summary', '')}' "
            f"starting {start_at}{_relative_days_label(start_at, now)}"
        )
    if chunk.source == "docs":
        return f"Google Doc titled '{metadata.get('title', '')}'"
    if chunk.source == "local_files":
        return f"Note file at {metadata.get('path', '')}"
    return f"{chunk.source} item {chunk.source_item_id}"


def build_user_message(
    question: str, chunks: list[RetrievedChunk], *, now: datetime | None = None, history: list[Any] | None = None
) -> str:
    """assembles the question plus every retrieved chunk's parent context
    into one message, numbered for citation. this whole string gets
    tokenized exactly once before being sent externally. `now` drives the
    per-item "(N days ago)" / "(in N days)" labels in _source_label, so the
    model never has to compute past-vs-future itself. `history`, when
    given, prepends the conversation's prior turns for follow-up context -
    folded into this same single string rather than Claude's native
    multi-turn `messages` shape, so it still gets covered by exactly one
    tokenize_for_external_call() like everything else in this project
    (see query/answer.py's docstring on why the redaction mapping is
    never persisted across calls)."""
    now = now if now is not None else datetime.now(tz=timezone.utc)
    lines = [f"Today's date: {now.date().isoformat()}", ""]
    if history:
        lines.append("Recent conversation in this thread:")
        for turn in history:
            speaker = "User" if turn["role"] == "user" else "Assistant"
            lines.append(f"{speaker}: {turn['content']}")
        lines.append("")
    lines += [f"Question:\n{question}", "", "Context:"]
    for index, chunk in enumerate(chunks, start=1):
        lines.append(f"[{index}] {_source_label(chunk, now=now)}")
        lines.append(chunk.parent_text)
        lines.append("")
    return "\n".join(lines).strip()


TIEBREAK_SYSTEM_PROMPT = (
    "Below is a question and one candidate piece of context an automated "
    "search found for it. The search's own relevance score was low, which "
    "already suggests this might not be a good match - decide for "
    "yourself whether the context genuinely contains information that "
    "answers or is directly relevant to the question, not just a loose "
    "topical connection. Respond with ONLY YES or NO, nothing else."
)


def build_tiebreak_user_message(question: str, candidate_text: str) -> str:
    return f"Question:\n{question}\n\nCandidate context:\n{candidate_text}"


SPLIT_COMPOUND_SYSTEM_PROMPT = (
    "Decide whether the user's question is genuinely asking about TWO OR "
    "MORE distinct, unrelated topics or items that would each need a "
    "separate search to answer (e.g. \"what's my pan application status "
    "and also when do i need to drop off my laptop\" - two unrelated "
    "items, a PAN application and a laptop). This is different from a "
    "single question with multiple clauses about the SAME topic or item "
    "(e.g. \"what's my pan status and when will it be delivered\" - both "
    "parts are about the one PAN application, so this is NOT compound), "
    "or a question merely phrased with an \"and\" that's really one ask "
    "(e.g. \"what did jane say about the budget and timeline\" - one "
    "email thread, one topic).\n\n"
    "If it is NOT genuinely compound, respond with ONLY the word SINGLE, "
    "nothing else - no punctuation, no explanation.\n\n"
    "If it IS genuinely compound, rewrite it as separate, self-contained "
    "questions, one per line, nothing else on each line - no numbering, "
    "no bullets, no blank lines. Each sub-question must stand alone "
    "(resolve any shared pronouns/context from the original) and "
    "otherwise preserve the user's original wording as closely as "
    "possible."
)


_ABSTAIN_REASON_TEMPLATES = {
    "no_candidates": 'Nothing in your indexed email, calendar, docs, or notes looks related to "{question}".',
    "no_candidates_in_date_range": 'Found content related to "{question}", but none of it falls in that date range.',
    "low_confidence": 'Nothing found for "{question}" was a confident enough match to answer from.',
    "no_upcoming_match": 'Nothing upcoming found for "{question}", and no earlier record either.',
}


def build_abstain_message(question: str, abstain_reason: str) -> str:
    """grounds the "nothing found" message in the actual question asked,
    instead of a fully generic phrase - found via real-user testing: a
    bare "nothing found" doesn't say what wasn't found, so there's no way
    to tell whether the system even understood the question. Plain string
    formatting only, no extra LLM call - abstaining stays zero-cost (see
    query/answer.py's tests proving the LLM is never called on an
    abstain)."""
    template = _ABSTAIN_REASON_TEMPLATES.get(abstain_reason, 'Nothing found for "{question}".')
    return template.format(question=question)


def format_sources(chunks: list[RetrievedChunk], *, now: datetime | None = None) -> str:
    """renders the final source list from data this project already owns -
    not parsed out of claude's response, which only produces the inline
    [N] citation markers in its prose."""
    now = now if now is not None else datetime.now(tz=timezone.utc)
    lines = ["Sources:"]
    for index, chunk in enumerate(chunks, start=1):
        lines.append(f"[{index}] {_source_label(chunk, now=now)}")
    return "\n".join(lines)
