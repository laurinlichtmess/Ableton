"""Strukturtests fuer das Loop-Sketch Max-for-Live-Device."""

from __future__ import annotations

import importlib.util
import json
import struct
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LS = ROOT / "m4l" / "LoopSketch"
spec = importlib.util.spec_from_file_location("ls_build_device", LS / "build_device.py")
build_device = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_device)


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("ls_device")
    maxpat, amxd = build_device.build(out)
    return json.loads(maxpat.read_text()), amxd.read_bytes()


def parse_amxd(data: bytes) -> dict:
    assert data[:4] == b"ampf"
    assert data[8:12] == b"aaaa"
    assert data[12:16] == b"meta"
    meta_len = struct.unpack("<I", data[16:20])[0]
    off = 20 + meta_len
    assert data[off:off + 4] == b"ptch"
    length = struct.unpack("<I", data[off + 4:off + 8])[0]
    body = data[off + 8:]
    assert len(body) == length
    return json.loads(body.rstrip(b"\x00").decode("utf-8"))


def boxes(patch):
    return {b["box"]["id"]: b["box"] for b in patch["patcher"]["boxes"]}


def test_amxd_matches_maxpat(built):
    patch, data = built
    assert parse_amxd(data) == patch


def test_committed_files_up_to_date(built):
    patch, data = built
    assert json.loads((LS / "LoopSketch.maxpat").read_text()) == patch
    assert (LS / "LoopSketch.amxd").read_bytes() == data


def test_to_arr_and_template_wiring(built):
    patch, _ = built
    texts = [b.get("text", "") for b in boxes(patch).values()]
    assert "to_arr" in texts
    assert "refresh" in texts
    assert any(t.startswith("node.script ls_node.js") for t in texts)
    assert any(t.startswith("js live_bridge.js") for t in texts)
    route = next(b for b in boxes(patch).values() if b.get("text", "").startswith("route status"))
    names = route["text"].split()[1:]
    assert "menu_template" in names
    for role in ("kick", "bass", "hats", "perc", "synth", "pad", "fx"):
        assert f"menu_{role}" in names


def test_templates_exist():
    index = json.loads((ROOT / "templates" / "index.json").read_text())
    assert len(index["templates"]) == 6
    for name in index["templates"]:
        assert (ROOT / "templates" / name).is_file()
