"""Settings manager for Book Reader desktop application.

Persists user preferences such as theme, font size, line width,
and daily reading goal in a JSON file.
"""

from __future__ import annotations

import json
from pathlib import Path

SETTINGS_FILE = Path(__file__).resolve().parent.parent / "data" / "settings.json"

DEFAULT_SETTINGS = {
    "theme": "Sepia",          # Light | Sepia | Dark
    "font_size": 18,          # in px (for EPUB & text)
    "line_width": 720,        # max width in px (for EPUB & text)
    "daily_goal_minutes": 15, # in minutes
    "focus_mode": False,
}


def load_settings() -> dict:
    """Load settings from data/settings.json or return defaults."""
    try:
        if SETTINGS_FILE.is_file():
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                merged = dict(DEFAULT_SETTINGS)
                merged.update(data)
                return merged
    except Exception:
        pass
    return dict(DEFAULT_SETTINGS)


def save_settings(settings: dict) -> None:
    """Save settings dictionary to data/settings.json."""
    try:
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception:
        pass


def get_setting(key: str, default=None):
    """Retrieve a single setting value."""
    s = load_settings()
    return s.get(key, default if default is not None else DEFAULT_SETTINGS.get(key))


def set_setting(key: str, value) -> None:
    """Update and persist a single setting value."""
    s = load_settings()
    s[key] = value
    save_settings(s)
