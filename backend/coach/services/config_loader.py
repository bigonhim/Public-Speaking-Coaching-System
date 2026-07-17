"""Load and cache the YAML configuration.

This is the ONLY place YAML is read. The pure scoring modules receive the
resulting dicts as arguments — they never call this loader and never import
Django, keeping them framework-free and testable.
"""

from functools import lru_cache
from pathlib import Path

import yaml

_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


@lru_cache(maxsize=1)
def load_scoring() -> dict:
    """Return the parsed scoring.yaml (cached)."""
    with open(_CONFIG_DIR / "scoring.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache(maxsize=1)
def load_fillers() -> dict:
    """Return the parsed fillers.yaml (cached)."""
    with open(_CONFIG_DIR / "fillers.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)
