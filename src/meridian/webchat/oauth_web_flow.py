from __future__ import annotations

from google.auth.transport.requests import AuthorizedSession
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from meridian.auth.oauth_flow import AUTH_URI, TOKEN_URI
from meridian.auth.scopes import SCOPES

# openid + userinfo.email so the callback can learn the real Google
# account email address - the existing CLI flow (auth/oauth_flow.py)
# never needed this, since there's only ever one local user asking "who
# am I." Kept as a separate constant rather than editing SCOPES itself,
# since the CLI flow's own scope list shouldn't grow for a web-only need.
WEB_FLOW_SCOPES = [*SCOPES, "openid", "https://www.googleapis.com/auth/userinfo.email"]

_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def build_web_flow(client_id: str, client_secret: str, redirect_uri: str) -> Flow:
    """the web-application OAuth flow (authorization-code + redirect),
    distinct from auth/oauth_flow.py's InstalledAppFlow (which opens its
    own localhost listener per run - fine for a one-off CLI consent, not
    usable for a server handling many browser sessions). Reuses the same
    Google Cloud OAuth client credentials as the CLI flow - only the flow
    *shape* differs, not the underlying app registration."""
    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": AUTH_URI,
            "token_uri": TOKEN_URI,
            "redirect_uris": [redirect_uri],
        }
    }
    flow = Flow.from_client_config(client_config, scopes=WEB_FLOW_SCOPES)
    flow.redirect_uri = redirect_uri
    return flow


def get_authorization_url(flow: Flow, *, state: str) -> str:
    """access_type=offline + prompt=consent, same as the CLI flow, so
    Google reliably returns a refresh_token rather than just a short-
    lived access_token. `state` round-trips through Google back to the
    callback - used here to carry the pending user_id, since this is a
    personal, single-operator tool rather than a public multi-tenant
    service where a stronger CSRF nonce would be warranted."""
    url, _ = flow.authorization_url(
        access_type="offline", prompt="consent", state=state, include_granted_scopes="true"
    )
    return url


def exchange_code_for_credentials(flow: Flow, *, code: str) -> Credentials:
    flow.fetch_token(code=code)
    return flow.credentials


def fetch_google_email(credentials: Credentials) -> str | None:
    session = AuthorizedSession(credentials)
    response = session.get(_USERINFO_URL, timeout=10)
    if response.status_code != 200:
        return None
    return response.json().get("email")
