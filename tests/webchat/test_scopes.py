from meridian.webchat.scopes import revoked_sources

_GMAIL = "https://www.googleapis.com/auth/gmail.readonly"
_CALENDAR = "https://www.googleapis.com/auth/calendar.readonly"
_DOCS = "https://www.googleapis.com/auth/documents.readonly"


def test_all_scopes_granted_means_nothing_revoked():
    user = {"scopes": [_GMAIL, _CALENDAR, _DOCS]}

    assert revoked_sources(user) == frozenset()


def test_missing_calendar_scope_is_revoked():
    # real bug: revoking a scope in Settings only ever updated a display
    # field - nothing in the query pipeline read it back.
    user = {"scopes": [_GMAIL, _DOCS]}

    assert revoked_sources(user) == frozenset({"calendar"})


def test_no_scopes_granted_revokes_all_three():
    user = {"scopes": []}

    assert revoked_sources(user) == frozenset({"gmail", "calendar", "docs"})


def test_missing_scopes_key_treated_as_none_granted():
    assert revoked_sources({}) == frozenset({"gmail", "calendar", "docs"})


def test_drive_scope_does_not_affect_docs():
    # the drive.readonly scope is real (granted alongside docs.readonly
    # for Drive file listing) but has no corresponding internal source of
    # its own - only documents.readonly maps to "docs".
    user = {"scopes": [_GMAIL, _CALENDAR, "https://www.googleapis.com/auth/drive.readonly"]}

    assert revoked_sources(user) == frozenset({"docs"})
