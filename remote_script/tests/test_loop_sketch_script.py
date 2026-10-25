"""Unit-Tests fuer das schlanke LoopSketch Remote Script (ohne Live)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LS = ROOT / "remote_script" / "LoopSketch"


def _load(name: str):
    path = LS / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"ls_{name}", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_ping():
    commands = _load("commands")

    class App:
        def get_major_version(self):
            return 11

        def get_minor_version(self):
            return 3

        def get_bugfix_version(self):
            return 25

    handler = commands.CommandHandler(get_song=lambda: None, get_application=lambda: App())
    reply = handler.handle({"id": 1, "cmd": "ping"})
    assert reply["ok"] is True, reply
    assert reply["product"] == "LoopSketch"
    assert reply["live_version"] == "11.3.25"


def test_unknown_command():
    commands = _load("commands")
    handler = commands.CommandHandler(get_song=lambda: None, get_application=lambda: None)
    reply = handler.handle({"cmd": "explode"})
    assert reply["ok"] is False
