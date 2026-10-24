import json
import os
from importlib import resources
from pathlib import Path

import jsonschema
import pytest

SNAPSHOT = Path(__file__).parent / "snapshots" / "synthetic_song.json"


def schema() -> dict:
    return json.loads(resources.files("reference_engine").joinpath("schema/analysis.schema.json").read_text())


def summarize(result: dict) -> dict:
    """Stabile Kurzfassung fuer den Snapshot (ohne Fliesskomma-Details)."""
    return {
        "bpm": round(result["tempo"]["bpm"]),
        "sections": [[s["label"], s["start_bar"], s["end_bar"]] for s in result["sections"]],
        "separation": result["separation"],
        "stems": {
            st["name"]: {
                "present": st["present"],
                "active_sections": st["active_sections"],
                "automation": sorted(a["target"] for a in st["automation"]),
            }
            for st in result["stems"]
        },
        "suggested_devices": sorted([d["stem"], d["device"]] for d in result["suggested_devices"]),
        "hints": sorted([h["type"], h["stem"]] for h in result["hints"]),
    }


def test_matches_schema(analysis):
    jsonschema.validate(analysis, schema())
    json.dumps(analysis)  # vollstaendig JSON-serialisierbar
    assert analysis["schema_version"] == 2
    assert [s["name"] for s in analysis["stems"]] == [
        "kick", "bass", "clap", "hats", "ride", "perc", "atmo", "synth", "vocals",
    ]


def test_tempo(analysis, song_mp3):
    _, spec = song_mp3
    assert analysis["tempo"]["bpm"] == pytest.approx(spec.bpm, abs=0.5)
    # Preroll 0.25 s + MP3-Encoder-Delay (~50 ms)
    assert analysis["tempo"]["first_downbeat_sec"] == pytest.approx(spec.preroll_sec, abs=0.08)


def test_section_boundaries(analysis, song_mp3):
    _, spec = song_mp3
    starts = [s["start_bar"] for s in analysis["sections"]]
    for expected in spec.boundaries[1:-1]:
        assert min(abs(expected - s) for s in starts) <= 1, f"Grenze bei Takt {expected} fehlt: {starts}"
    secs = analysis["sections"]
    assert secs[0]["start_bar"] == 0
    assert all(a["end_bar"] == b["start_bar"] for a, b in zip(secs, secs[1:]))
    assert all(s["start_beat"] == s["start_bar"] * 4 and s["length_beats"] == s["bars"] * 4 for s in secs)
    assert all(s["bars"] >= 4 for s in secs)
    assert all(s.get("kind") for s in secs)


def test_section_labels(analysis):
    labels = [s["label"].split(" ")[0] for s in analysis["sections"]]
    assert labels[:5] == ["Intro", "Build", "Drop", "Breakdown", "Drop"]
    assert labels[-1] == "Outro"
    by_start = {s["start_bar"]: s for s in analysis["sections"]}
    assert by_start[16]["group"] == by_start[32]["group"], "beide Drops sollten dieselbe Gruppe haben"
    assert "kick" in by_start[16]["elements"] and "kick" not in by_start[24]["elements"]


def test_filter_sweep_suggestion(analysis):
    synth = next(s for s in analysis["stems"] if s["name"] == "synth")
    filt = next(a for a in synth["automation"] if a["target"] == "filter_cutoff")
    ramp = filt["ramps"][0]
    assert ramp["direction"] == "up"
    assert 28 <= ramp["start_beat"] <= 40 and 48 <= ramp["end_beat"] <= 68  # Build = Takt 9-16
    assert ramp["to"] / ramp["from"] > 4
    assert {"stem": "synth", "device": "Auto Filter"}.items() <= next(
        d for d in analysis["suggested_devices"] if d["stem"] == "synth" and d["device"] == "Auto Filter").items()


def test_fade_and_sidechain(analysis):
    bass = next(s for s in analysis["stems"] if s["name"] == "bass")
    gain = next(a for a in bass["automation"] if a["target"] == "gain")
    assert gain["ramps"][-1]["direction"] == "down" and gain["ramps"][-1]["start_beat"] >= 152
    assert any(h["type"] == "sidechain_pump" for h in analysis["hints"])


def test_breakdown_has_no_kick(analysis):
    kick = next(s for s in analysis["stems"] if s["name"] == "kick")
    idx = next(i for i, s in enumerate(analysis["sections"]) if s["label"].startswith("Breakdown"))
    assert kick["active_sections"][idx] is False


def test_snapshot(analysis):
    summary = summarize(analysis)
    if os.environ.get("UPDATE_SNAPSHOTS") or not SNAPSHOT.exists():
        SNAPSHOT.parent.mkdir(exist_ok=True)
        SNAPSHOT.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    assert summary == json.loads(SNAPSHOT.read_text())


def test_silent_stem_is_marked_absent(monkeypatch, song_mp3):
    """Uebersprechen (z. B. 'vocals' bei einem Instrumental) erzeugt weder Clips noch Automation."""
    import numpy as np

    from reference_engine import pipeline
    from reference_engine.audio import load_mono
    from reference_engine.separation import SeparationResult

    path, _ = song_mp3
    y = load_mono(path)

    def fake_separate(p, audio, method="auto", sha1=None, progress=None):
        bleed = (audio * 10 ** (-55 / 20)).astype(np.float32)
        return SeparationResult("demucs", {"drums": audio, "bass": bleed, "other": bleed, "vocals": bleed}), []

    monkeypatch.setattr(pipeline, "separate", fake_separate)
    result = pipeline.analyze_audio(y, path)
    jsonschema.validate(result, schema())
    stems = {s["name"]: s for s in result["stems"]}
    assert stems["kick"]["present"] is True
    assert stems["vocals"]["present"] is False
    assert not any(stems["vocals"]["active_sections"]) and stems["vocals"]["automation"] == []
    assert all(d["stem"] != "vocals" for d in result["suggested_devices"])


def test_m4l_fixture_matches_schema():
    """Vertrag Engine <-> M4L: die Fixture der JS-Tests muss dem aktuellen Schema entsprechen."""
    fixture = Path(__file__).resolve().parents[2] / "m4l" / "tests" / "fixtures" / "analysis.json"
    jsonschema.validate(json.loads(fixture.read_text()), schema())


def test_wav_and_cli(tmp_path):
    from synth import SongSpec, write_song

    from reference_engine.cli import main

    spec = SongSpec(sections=[("a", 8, {"pad", "hats"}), ("b", 8, {"kick", "bass", "lead", "hats"})])
    wav = tmp_path / "short.wav"
    write_song(wav, spec)
    out = tmp_path / "out.json"
    assert main(["analyze", str(wav), "-o", str(out), "--separation", "bands"]) == 0
    result = json.loads(out.read_text())
    jsonschema.validate(result, schema())
    assert [s["start_bar"] for s in result["sections"]][:2] == [0, 8]
