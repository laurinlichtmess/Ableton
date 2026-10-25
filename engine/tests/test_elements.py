"""Element-Erkennung: Kick vs. Bass (gleicher Tieffrequenzbereich), Ride, Clap, Pad/Atmo."""

from __future__ import annotations

import numpy as np
import pytest
from groove import HARDGROOVE_GAINS, GrooveSpec, mix, render_elements, stems_from

from reference_engine import elements as E
from reference_engine.automation import curves_from_mag
from reference_engine.segments import ElementBars, bar_features, segment_song
from reference_engine.tempo import estimate_grid


def _presence(stems, mix_y, method, grid):
    out = {}
    for sig in E.element_signals(stems, mix_y, method, grid):
        c = curves_from_mag(sig.mag, grid)
        bars = E.bar_levels_db(c.rms_db, 4, grid.num_bars)
        p, _ = E.presence_from_levels(bars, sig.name, separated=(method != "bands"))
        out[sig.name] = E.smooth_presence(p)
    return out


@pytest.fixture(scope="module")
def groove():
    spec = GrooveSpec(bpm=147.0)
    elements = render_elements(spec)
    y = mix(elements, HARDGROOVE_GAINS)
    stems = stems_from(elements, HARDGROOVE_GAINS)
    grid = estimate_grid(y)
    return spec, elements, y, stems, grid


def test_kick_vs_bass_same_low_band(groove):
    """Kick und Bass teilen sich <150 Hz; Presence darf nicht vertauscht werden."""
    spec, _, y, stems, grid = groove
    for method in ("demucs", "bands"):
        src = stems if method == "demucs" else {}
        pres = _presence(src, y, method, grid)
        for a, b, elems in zip(spec.boundaries[:-1], spec.boundaries[1:], [e for _, _, e in spec.sections]):
            kick_on = "kick" in elems
            bass_on = "bass" in elems
            assert abs(pres["kick"][a:b].mean() - float(kick_on)) < 0.15, (method, a, b)
            assert abs(pres["bass"][a:b].mean() - float(bass_on)) < 0.15, (method, a, b)


def test_ride_clap_atmo_hats(groove):
    spec, _, y, stems, grid = groove
    pres = _presence(stems, y, "demucs", grid)
    expected = {
        "ride": [False, True, False, True, False],
        "clap": [False, True, False, True, False],
        "hats": [True, True, False, True, True],
        "atmo": [False, False, True, False, False],
        "synth": [False, False, True, True, False],
        "perc": [True, True, True, True, True],
    }
    for name, flags in expected.items():
        for (a, b), want in zip(zip(spec.boundaries[:-1], spec.boundaries[1:]), flags):
            got = float(pres[name][a:b].mean())
            assert abs(got - float(want)) < 0.15, f"{name} bars {a}-{b}: {got} vs {want}"


def test_sections_use_elements(groove):
    spec, _, y, stems, grid = groove
    feat = bar_features(y, grid)
    present = _presence(stems, y, "demucs", grid)
    strength = {n: present[n].astype(float) for n in present}
    eb = ElementBars(present=present, strength=strength)
    sections = segment_song(feat, eb)
    labels = [s.label.split()[0] for s in sections]
    assert labels[0] == "Intro"
    assert "Main" in labels or "Drop" in labels
    assert any(s.label.startswith("Breakdown") for s in sections)
    assert labels[-1] == "Outro"
    # Typische Phrasenlaenge, nicht Dutzende 4-Takt-Splitter.
    assert len(sections) <= 8
    assert all(s.bars >= 8 or s.label in ("Intro", "Outro", "Build") for s in sections)
    starts = [s.start_bar for s in sections]
    for expected in spec.boundaries[1:-1]:
        assert min(abs(expected - s) for s in starts) <= 2


def test_isolated_kick_and_bass_energy():
    """Reines Kick-Signal vs. reiner Bass: Masken trennen trotz gleichem Tiefband."""
    from groove import kick as make_kick

    sr = 22050
    beat = int(0.5 * sr)
    n = beat * 16
    k = np.zeros(n, dtype=np.float32)
    for i in range(0, n, beat):
        hit = make_kick(beat)
        k[i:i + len(hit)] += hit
    t = np.arange(n) / sr
    bass = (0.4 * np.sin(2 * np.pi * 55 * t)).astype(np.float32)
    from reference_engine.tempo import BeatGrid
    grid = BeatGrid(bpm=120.0, first_downbeat_sec=0.0, duration_sec=n / sr, confidence=1.0)
    # Kick allein: Bass-Presence niedrig
    pk = _presence({"drums": k, "bass": np.zeros_like(k), "other": np.zeros_like(k), "vocals": np.zeros_like(k)},
                   k, "demucs", grid)
    assert pk["kick"].mean() > 0.8
    assert pk["bass"].mean() < 0.2
    # Bass allein: Kick-Presence niedrig
    pb = _presence({"drums": np.zeros_like(bass), "bass": bass, "other": np.zeros_like(bass),
                    "vocals": np.zeros_like(bass)}, bass, "demucs", grid)
    assert pb["bass"].mean() > 0.8
    assert pb["kick"].mean() < 0.2
