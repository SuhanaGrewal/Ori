from __future__ import annotations

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import Resource, build

from ori.auth.credentials import get_credentials
from ori.common.config import Config


def build_calendar_service(
    config: Config | None = None, *, credentials: Credentials | None = None
) -> Resource:
    credentials = credentials or get_credentials(config=config)
    return build("calendar", "v3", credentials=credentials, cache_discovery=False)
