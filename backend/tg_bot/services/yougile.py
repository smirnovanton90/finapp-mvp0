"""YouGile API client for creating tasks."""

import logging
from datetime import datetime, timezone

import requests

from config import settings

logger = logging.getLogger(__name__)

BUG_REPORT_LIMIT_PER_HOUR = 5


def create_task(title: str, description: str) -> dict | None:
    """Create a task in YouGile. Returns task data or None on failure."""
    if not settings.yougile_api_key or not settings.yougile_column_id:
        logger.warning("YouGile not configured: missing API key or column ID")
        return None

    url = f"{settings.yougile_base_url.rstrip('/')}/tasks"
    headers = {
        "Authorization": f"Bearer {settings.yougile_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "title": title[:200],
        "columnId": settings.yougile_column_id,
        "description": description,
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        logger.exception("YouGile API error: %s", e)
        return None
