from __future__ import annotations

import base64
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from ori.security.validation import truncate_field


class MessageParseError(Exception):
    pass


@dataclass(frozen=True)
class ParsedMessage:
    message_id: str
    thread_id: str
    subject: str
    sender: str
    recipients: list[str]
    sent_at: str
    body_text: str
    label_ids: list[str]
    content_hash: str


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_HTML_STYLE_SCRIPT_RE = re.compile(r"<(style|script)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_WHITESPACE_RUN_RE = re.compile(r"\s+")


def parse_message(raw: dict[str, Any], attachment_texts: list[str] | None = None) -> ParsedMessage:
    """attachment_texts, when given, is text already extracted from this
    message's attachments (see attachment_parser.py) by the caller -
    parse_message() itself does no network I/O (it's a pure function over
    an already-fetched message, deliberately kept testable without a live
    Gmail client), but fetching attachment bytes requires a second API
    call per attachment that only sync.py has the service/rate-limiter to
    make. Appended to the extracted body text (subject to the same
    truncate_field cap) rather than stored as a separate column - many
    real emails carry their entire substance in an attachment with an
    all-but-empty body (see list_attachment_refs's docstring), so
    treating attachment text as "more of the body" rather than a
    separate, easy-to-forget-to-check field is what actually makes that
    content reachable by retrieval and the reply-status/stale-thread
    checks that read body_text directly."""
    try:
        message_id = raw["id"]
        thread_id = raw["threadId"]
        payload = raw["payload"]
    except KeyError as exc:
        raise MessageParseError(f"missing required field: {exc}") from exc

    headers = _headers_dict(payload.get("headers", []))
    subject = truncate_field(headers.get("subject", ""))
    sender = headers.get("from", "")
    recipients = _split_addresses(headers.get("to", "")) + _split_addresses(headers.get("cc", ""))
    label_ids = raw.get("labelIds", [])

    sent_at = _extract_sent_at(raw, headers)
    body_text = _extract_body_text(payload)
    if attachment_texts:
        attachment_section = "\n\n".join(text for text in attachment_texts if text.strip())
        if attachment_section:
            body_text = f"{body_text}\n\n{attachment_section}".strip() if body_text.strip() else attachment_section
    body_text = truncate_field(body_text)
    content_hash = _hash_content(subject, sender, recipients, body_text, label_ids)

    return ParsedMessage(
        message_id=message_id,
        thread_id=thread_id,
        subject=subject,
        sender=sender,
        recipients=recipients,
        sent_at=sent_at,
        body_text=body_text,
        label_ids=label_ids,
        content_hash=content_hash,
    )


def _headers_dict(headers: list[dict[str, str]]) -> dict[str, str]:
    return {h["name"].lower(): h.get("value", "") for h in headers if "name" in h}


def _split_addresses(value: str) -> list[str]:
    if not value:
        return []
    return [addr.strip() for addr in value.split(",") if addr.strip()]


def _extract_sent_at(raw: dict[str, Any], headers: dict[str, str]) -> str:
    internal_date = raw.get("internalDate")
    if internal_date is not None:
        try:
            timestamp_ms = int(internal_date)
            return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).isoformat()
        except (TypeError, ValueError):
            pass
    return headers.get("date", "")


def _extract_body_text(payload: dict[str, Any]) -> str:
    plain = _find_part_body(payload, "text/plain")
    if plain is not None:
        return plain

    html = _find_part_body(payload, "text/html")
    if html is not None:
        return _strip_html(html)

    return ""


def _find_part_body(payload: dict[str, Any], mime_type: str) -> str | None:
    if payload.get("mimeType") == mime_type:
        data = payload.get("body", {}).get("data")
        if data:
            return _decode_base64url(data)

    for part in payload.get("parts", []) or []:
        found = _find_part_body(part, mime_type)
        if found is not None:
            return found

    return None


def _decode_base64url(data: str) -> str:
    return decode_base64url_bytes(data).decode("utf-8", errors="replace")


def decode_base64url_bytes(data: str) -> bytes:
    """same base64url-with-missing-padding decode _decode_base64url uses
    for inline text bodies, but returning raw bytes rather than decoding
    as UTF-8 text - an attachment (docx/pdf/image) is binary, not text,
    and decoding it as UTF-8 would corrupt it. Exported for sync.py,
    which fetches attachment bytes via a separate
    messages.attachments.get() API call this module deliberately doesn't
    make itself (see parse_message's attachment_texts docstring)."""
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded)


@dataclass(frozen=True)
class AttachmentRef:
    attachment_id: str
    filename: str
    mime_type: str
    size: int


def list_attachment_refs(payload: dict[str, Any]) -> list[AttachmentRef]:
    """walks the payload tree (same recursive-parts traversal as
    _find_part_body) collecting every part that's a real attachment - has
    a filename AND references its bytes via attachmentId rather than
    carrying them inline as body.data. This is common, not an edge case:
    a message forwarding a Word doc, PDF, or image typically has an
    almost-empty text/plain and text/html body alongside it (see this
    module's real-testing note in _strip_html for other body-quality
    issues found the same way) - without reading the attachment itself,
    a personal-assistant query whose real answer lives in that file has
    nothing to work with."""
    refs: list[AttachmentRef] = []

    def _walk(part: dict[str, Any]) -> None:
        filename = part.get("filename") or ""
        attachment_id = part.get("body", {}).get("attachmentId")
        if filename and attachment_id:
            refs.append(
                AttachmentRef(
                    attachment_id=attachment_id,
                    filename=filename,
                    mime_type=part.get("mimeType", ""),
                    size=part.get("body", {}).get("size", 0),
                )
            )
        for child in part.get("parts", []) or []:
            _walk(child)

    _walk(payload)
    return refs


def _strip_html(html: str) -> str:
    """the tag-stripping regex only removes tags themselves, not the raw
    CSS/JS *text content* sitting between <style>/<script> tags - found
    live via real testing: a real Trainline booking-confirmation email
    (MJML-generated, like most transactional emails) left hundreds of
    characters of CSS rules ("#outlook a { padding:0; }", font imports,
    etc.) in the "extracted" body text, displacing or truncating the
    actual booking details and causing the model to hallucinate a
    passenger name from an unrelated word in the subject line instead of
    admitting the real content wasn't there. Strip these blocks (tag AND
    content) before the generic tag strip."""
    # HTML whitespace (indentation, forced line-wrapping, \r\n from the
    # source markup) is purely presentational and carries no meaning once
    # tags are gone - found live: a real admissions email's mailing
    # address rendered as "15\r\nGarden Estate\r\nMG Road" in the
    # extracted body text, and the model then quoted those literal \r\n
    # sequences verbatim in its answer, breaking a one-line address across
    # multiple lines mid-sentence. Collapsing every whitespace run to a
    # single space is how a browser would render this HTML anyway, so
    # this doesn't lose real structure - unlike a plain-text email, where
    # line breaks are often intentional (paragraphs, signatures) and are
    # deliberately left untouched.
    without_style_or_script = _HTML_STYLE_SCRIPT_RE.sub(" ", html)
    without_tags = _HTML_TAG_RE.sub(" ", without_style_or_script)
    return _WHITESPACE_RUN_RE.sub(" ", without_tags).strip()


def _hash_content(
    subject: str, sender: str, recipients: list[str], body_text: str, label_ids: list[str]
) -> str:
    normalized = json.dumps(
        {
            "subject": subject,
            "sender": sender,
            "recipients": sorted(recipients),
            "body_text": body_text,
            "label_ids": sorted(label_ids),
        },
        sort_keys=True,
    )
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
