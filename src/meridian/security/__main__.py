from __future__ import annotations

import argparse

from meridian.common.config import load_config
from meridian.ingestion.gmail.store import GmailStore
from meridian.redaction.analyzer import build_analyzer_engine
from meridian.redaction.entities import HARD_SECRET_ENTITIES
from meridian.redaction.tokenize import tokenize_for_external_call, untokenize
from meridian.security.audit_log import verify_audit_log


def main() -> None:
    parser = argparse.ArgumentParser(description="Meridian security utilities.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("verify-audit", help="Check logs/audit.log's hash chain for tampering.")

    check_parser = subparsers.add_parser(
        "check-redaction",
        help="Show a real email's raw text next to exactly what would be sent to Claude, to verify redaction.",
    )
    check_parser.add_argument(
        "--subject", default=None,
        help="Case-insensitive substring to find a specific message by subject. Defaults to the most recent message.",
    )
    args = parser.parse_args()

    config = load_config()

    if args.command == "verify-audit":
        path = config.log_dir / "audit.log"
        broken = verify_audit_log(path)
        if not path.exists():
            print(f"{path}: no audit log yet.")
        elif not broken:
            entry_count = sum(1 for _ in path.open())
            print(f"{path}: intact ({entry_count} entries).")
        else:
            print(f"{path}: {len(broken)} broken chain link(s) at line(s) {broken}.")

    elif args.command == "check-redaction":
        gmail_store = GmailStore(config.ingestion_dir / "gmail" / "gmail.db")
        rows = [row for row in gmail_store.get_all_messages() if row["body_text"]]
        if not rows:
            print("No Gmail messages with body text found - run `python -m meridian.ingestion.gmail` first.")
            return

        if args.subject:
            needle = args.subject.lower()
            rows = [row for row in rows if needle in (row["subject"] or "").lower()]
            if not rows:
                print(f"No message found with subject containing '{args.subject}'.")
                return

        row = max(rows, key=lambda r: r["sent_at"] or "")
        raw_text = row["body_text"]

        analyzer = build_analyzer_engine()
        tokenization = tokenize_for_external_call(raw_text, analyzer=analyzer)

        print(f"Message: '{row['subject']}' from {row['sender']}, sent {row['sent_at']}\n")
        print("=== RAW (never leaves this machine) ===")
        print(raw_text)
        print()
        print("=== WHAT ACTUALLY GETS SENT TO CLAUDE ===")
        print(tokenization.tokenized_text)
        print()
        print(f"Entities found and replaced: {tokenization.entity_counts}")

        hard_secrets_found = any(entity_type in HARD_SECRET_ENTITIES for entity_type in tokenization.entity_counts)
        restored = untokenize(tokenization.tokenized_text, tokenization.mapping)
        round_trip_matches = restored == raw_text
        print(f"\nRound-trip check (restoring placeholders reproduces the original exactly): {round_trip_matches}")
        if hard_secrets_found and not round_trip_matches:
            print(
                "(Expected mismatch: a hard secret - credit card, API key, etc. - was found and replaced with "
                "[REDACTED], which by design is never restored, even locally.)"
            )


if __name__ == "__main__":
    main()
