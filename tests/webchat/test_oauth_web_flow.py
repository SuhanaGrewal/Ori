from ori.webchat.oauth_web_flow import build_web_flow, get_authorization_url


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


def test_get_authorization_url_omits_pkce_code_challenge():
    # google-auth-oauthlib auto-generates a PKCE code_verifier by default,
    # but the callback exchanges the code on a brand-new Flow instance
    # that never had that verifier - if the authorization URL includes a
    # code_challenge, token exchange always fails with "invalid_grant:
    # Missing code verifier" (see server.py's google_start/google_callback,
    # which build separate Flow instances per request).
    flow = build_web_flow("client-id", "client-secret", "http://localhost:8000/api/auth/google/callback")

    url = get_authorization_url(flow, state="user_abc123")

    assert "code_challenge" not in url
