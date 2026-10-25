"""Echter Demucs-Lauf (optional): RUN_DEMUCS_TESTS=1 uv run pytest tests/test_demucs_integration.py

Braucht `uv sync --extra stems` und laedt beim ersten Mal das Modell htdemucs (~80 MB).
"""

import os

import pytest

pytestmark = pytest.mark.skipif(not os.environ.get("RUN_DEMUCS_TESTS"), reason="RUN_DEMUCS_TESTS=1 setzen")


def test_demucs_analysis(song_mp3, tmp_path, monkeypatch):
    pytest.importorskip("demucs")
    from reference_engine.pipeline import analyze_file

    monkeypatch.setenv("REFERENCE_ENGINE_CACHE", str(tmp_path))
    path, spec = song_mp3
    result = analyze_file(path, separation="demucs")
    assert result["separation"] == "demucs" and not result["warnings"]
    stems = {s["name"]: s for s in result["stems"]}
    assert set(stems) == {"drums", "bass", "other", "vocals"}
    assert stems["vocals"]["present"] is False, "Testsong hat keine Vocals"
    # Bass spielt erst ab dem ersten Drop (Takt 17).
    assert stems["bass"]["active_sections"][:2] == [False, False]
    assert stems["drums"]["active_sections"][3] is False  # Breakdown
    assert any(a["target"] == "filter_cutoff" for a in stems["other"]["automation"])
    assert any(h["type"] == "sidechain_pump" and h["stem"] == "bass" for h in result["hints"])
    assert any((tmp_path / "stems").iterdir()), "Stems werden gecacht"
