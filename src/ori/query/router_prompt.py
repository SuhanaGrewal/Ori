from __future__ import annotations

from typing import Any

CLASSIFY_SYSTEM_PROMPT = (
    "Classify the user's message into exactly one of these categories. "
    "Respond with ONLY the category word, nothing else - no punctuation, "
    "no explanation.\n\n"
    "STALE_THREADS - asking about the OPEN-ENDED LIST of email threads "
    "waiting on their reply, or needing their attention/approval (e.g. "
    "\"any threads need my approval\", \"what am I waiting to reply to\", "
    "\"anything pending in my inbox\"). Different from GENERAL: a question "
    "about ONE specific, named thread or person's status (e.g. \"billy "
    "wardrop thread status\", \"what am i waiting for on my pan "
    "application\", \"anything i still need to send billy wardrop\") is "
    "GENERAL - it's asking about that one specific item, not the "
    "open-ended stale-threads list.\n"
    "COMMITMENTS - asking about the OPEN-ENDED LIST of tracked promises or "
    "follow-ups, theirs or someone else's (e.g. \"what do I owe people\", "
    "\"any open commitments\", \"what's overdue\"). Different from "
    "GENERAL: a question about ONE specific, named item's status (e.g. "
    "\"whats pending with my pan\", \"what's the status of my pan "
    "application\") is GENERAL, not COMMITMENTS - COMMITMENTS is only for "
    "the open-ended list across everything, not one named thing.\n"
    "RESOLVE - the user TELLING you something is done, resolved, or "
    "handled, so it stops being shown (e.g. \"mark that resolved\", \"I "
    "already replied to that\", \"that's handled now\", \"you can omit "
    "that one going forward\") - a statement, not a question. Different "
    "from GENERAL: a QUESTION asking whether something is already "
    "resolved or done (e.g. \"is the laptop thing resolved yet\", \"has "
    "that been sorted\") is GENERAL, not RESOLVE - the user is asking you "
    "to check and tell them, not telling you it's done themselves. Getting "
    "this wrong is worse than getting other categories wrong: RESOLVE "
    "actually marks something handled, so misreading a question as RESOLVE "
    "silently takes an action nobody asked for.\n"
    "BROAD_SUMMARY - asking for a general overview of recent activity "
    "across a source, not one specific fact (e.g. \"summarize my recent "
    "emails\", \"catch me up on my inbox\", \"what's been happening "
    "lately\", \"what's new\"). Different from STALE_THREADS: this is "
    "about recent activity in general, not specifically about what's "
    "waiting on a reply. Different from GENERAL: a scoped schedule "
    "question like \"what do I have on this week\", \"what's on my "
    "calendar today\", or \"any meetings tomorrow\" is GENERAL (it's "
    "asking for specific calendar facts, even though it isn't about one "
    "single named event) - BROAD_SUMMARY is only for an open-ended "
    "request to summarize inbox activity with no specific scope.\n"
    "REMINDER - an imperative statement asking to be reminded or to track "
    "a task, not a question (e.g. \"remind me to meet with Nick\", \"I "
    "need to call the accountant\", \"don't let me forget to renew the "
    "passport\"). Different from a question: the user is stating something "
    "they want tracked, not asking to be told something - this holds even "
    "if the question is worded awkwardly or out of natural order (e.g. "
    "\"laptop drop off when do i need to\" is still a question asking to "
    "be told an existing date, i.e. GENERAL, not a request to create a "
    "new tracked reminder, even though it lacks a leading question word "
    "and could look imperative at a glance).\n"
    "DRAFT_REPLY - asking for a reply to be drafted/written for a "
    "specific email or thread (e.g. \"draft a reply to Alice's email\", "
    "\"write a response to the budget thread\", \"help me reply to "
    "Nick\"). Different from REMINDER: this produces a draft to review, "
    "not a tracked task.\n"
    "REPLY_STATUS - asking whether a SPECIFIC email/thread the user sent "
    "has received a reply yet (e.g. \"did dr reply to my immunization "
    "record\", \"has anyone responded to my application email\", \"did I "
    "hear back from Billy about the IT kit\"). Different from "
    "STALE_THREADS: this is about ONE specific, named email the user "
    "sent, not the open-ended list of things waiting on THEIR reply - "
    "REPLY_STATUS is the opposite direction (waiting on someone else). "
    "Different from GENERAL: GENERAL answers a question from the CONTENT "
    "of a matched document; REPLY_STATUS is a structural yes/no about "
    "whether any reply exists at all, which matters most exactly when "
    "there's no reply content to retrieve an answer from.\n"
    "CALENDAR_CONFLICTS - asking whether calendar events overlap or clash "
    "on a given day/period (e.g. \"did I have overlapping meetings on "
    "monday\", \"any double-booked days this week\", \"do my meetings "
    "conflict today\"). Different from GENERAL: a question about ONE "
    "specific event's own details (its time, location, attendees) is "
    "GENERAL, not CALENDAR_CONFLICTS - this category is only for "
    "checking whether two or more events overlap each other.\n"
    "GENERAL - anything else, including specific fact questions about "
    "email, calendar, document, or note content (e.g. \"when did I fly to "
    "London\", \"what did Jane say about the budget\")."
)

SUMMARIZE_STALE_THREADS_SYSTEM_PROMPT = (
    "You are a personal assistant summarizing email threads that are "
    "waiting on the user's reply. Use ONLY the thread details given below "
    "- never invent details not present. Write like you're giving a quick "
    "verbal heads-up: plain sentences, no markdown headers, no bullet "
    "lists dressed up as content categories, no emoji. Describe what each "
    "thread is about IN YOUR OWN WORDS - do not quote the raw message text "
    "verbatim, UNLESS the user's own question explicitly asks to see the "
    "actual email/message (e.g. \"what did they actually say\", \"show me "
    "the email\"), in which case you may quote the relevant part. If there "
    "are no threads, say so plainly. Cite each thread you mention by its "
    "bracket number, like [1].\n\n"
    "Some names, email addresses, phone numbers, and addresses have been "
    "replaced with placeholders like <PERSON_1>, <EMAIL_ADDRESS_1>, "
    "<PHONE_NUMBER_1>, or <HOME_ADDRESS_1> to protect privacy. Treat these "
    "exactly like real names/emails/etc. - use them naturally, and do not "
    "comment on or explain the placeholders themselves."
)

SUMMARIZE_BROAD_ASK_SYSTEM_PROMPT = (
    "You are directly answering the user's own question by summarizing "
    "the gathered items below. Use ONLY the items given - never invent "
    "anything not present. Write like you're giving a direct answer, not "
    "composing a report: plain sentences, no markdown headers, no bullet "
    "lists dressed up as content categories, no emoji. Organize by source "
    "(calendar, email, docs, notes) rather than by topic. If several items "
    "are routine noise (e.g. newsletters), say how many there were and "
    "name only the one or two actually worth mentioning, then move on. If "
    "there's nothing relevant, say so plainly. Cite each item you mention "
    "by its bracket number, like [1].\n\n"
    "Some names, email addresses, phone numbers, and addresses have been "
    "replaced with placeholders like <PERSON_1>, <EMAIL_ADDRESS_1>, "
    "<PHONE_NUMBER_1>, or <HOME_ADDRESS_1> to protect privacy. Treat these "
    "exactly like real names/emails/etc. - use them naturally, and do not "
    "comment on or explain the placeholders themselves."
)

MATCH_RESOLVE_SYSTEM_PROMPT = (
    "The user wants to mark something as resolved/handled so it stops "
    "being shown to them. Given their message and the numbered list of "
    "currently open items below, decide which item(s) they mean. Respond "
    "with ONLY the bracket number(s), comma-separated (e.g. \"2\" or "
    "\"1,3\"), or NONE if you cannot confidently tell which item they mean "
    "from the list - never guess."
)

MATCH_DRAFT_TARGET_SYSTEM_PROMPT = (
    "The user wants a reply drafted for one specific email thread. Given "
    "their message and the numbered list of threads currently awaiting "
    "their reply below, decide which ONE thread they mean. Respond with "
    "ONLY the bracket number (e.g. \"2\"), or NONE if you cannot "
    "confidently tell which thread they mean from the list - never guess."
)

MATCH_REPLY_STATUS_TARGET_SYSTEM_PROMPT = (
    "The user is asking whether a specific email they sent has received a "
    "reply. Given their message and the numbered list of emails they've "
    "sent below (with subject and date), decide which ONE they mean. "
    "Respond with ONLY the bracket number (e.g. \"2\"), or NONE if you "
    "cannot confidently tell which email they mean from the list - never "
    "guess."
)


def build_stale_threads_user_message(question: str, threads: list[Any]) -> str:
    lines = [f"User's question:\n{question}", "", "Threads:"]
    for index, thread in enumerate(threads, start=1):
        lines.append(
            f"[{index}] From {thread.last_sender}, subject '{thread.subject}', "
            f"quiet for {thread.days_quiet} day(s)"
        )
        lines.append(thread.last_message_snippet)
        lines.append("")
    return "\n".join(lines).strip()


def build_resolve_candidates_message(text: str, labels: list[str]) -> str:
    lines = [f"User's message:\n{text}", "", "Open items:"]
    for index, label in enumerate(labels, start=1):
        lines.append(f"[{index}] {label}")
    return "\n".join(lines).strip()


def build_draft_target_candidates_message(text: str, labels: list[str]) -> str:
    lines = [f"User's message:\n{text}", "", "Threads awaiting your reply:"]
    for index, label in enumerate(labels, start=1):
        lines.append(f"[{index}] {label}")
    return "\n".join(lines).strip()


def build_reply_status_target_message(text: str, labels: list[str]) -> str:
    lines = [f"User's message:\n{text}", "", "Emails you've sent:"]
    for index, label in enumerate(labels, start=1):
        lines.append(f"[{index}] {label}")
    return "\n".join(lines).strip()


def build_broad_ask_user_message(question: str, items: list[Any]) -> str:
    lines = [f"User's question:\n{question}", "", "Items:"]
    for index, item in enumerate(items, start=1):
        lines.append(f"[{index}] {item['label']}")
        if item["detail"]:
            lines.append(item["detail"])
        lines.append("")
    return "\n".join(lines).strip()
