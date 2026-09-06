from meridian.webchat.oauth_web_flow import build_web_flow, get_authorization_url


def test_build_web_flow_sets_redirect_uri():
    flow = build_web_flow("client-id", "client-secret", "http://localhost:8000/api/auth/google/callback")

    assert flow.redirect_uri == "http://localhost:8000/api/auth/google/callback"


def test_get_authorization_url_includes_state_and_offline_access():
    flow = build_web_flow("client-id", "client-secret", "http://localhost:8000/api/auth/google/callback")

    url = get_authorization_url(flow, state="user_abc123")

    assert "accounts.google.com" in url
    assert "state=user_abc123" in url
    assert "access_type=offline" in url
    assert "prompt=consent" in url


def test_get_authorization_url_requests_readonly_and_email_scopes():
    flow = build_web_flow("client-id", "client-secret", "http://localhost:8000/api/auth/google/callback")

    url = get_authorization_url(flow, state="user_abc123")

    assert "gmail.readonly" in url
    assert "userinfo.email" in url
