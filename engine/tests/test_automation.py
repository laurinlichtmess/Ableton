import numpy as np
from synth import SR, _lowpass_sweep, _saw

from reference_engine.automation import (
    FILTER_OPEN_HZ,
    detect_ramps,
    filter_automation,
    gain_automation,
    sidechain_hint,
    stem_curves,
)
from reference_engine.tempo import BeatGrid


def grid_for(seconds: float, bpm: float = 120.0) -> BeatGrid:
    return BeatGrid(bpm=bpm, first_downbeat_sec=0.0, duration_sec=seconds, confidence=1.0)


def test_detect_ramp_linear():
    v = np.concatenate([np.zeros(16), np.linspace(0, 3, 16), np.full(16, 3.0)])
    ramps = detect_ramps(v, min_delta=1.5)
    assert len(ramps) == 1
    r = ramps[0]
    assert r.direction == "up"
    assert 12 <= r.start <= 20 and 28 <= r.end <= 36


def test_step_is_not_a_ramp():
    v = np.concatenate([np.zeros(24), np.full(24, 3.0)])
    assert detect_ramps(v, min_delta=1.5) == []


def test_flat_and_noise_have_no_ramps():
    rng = np.random.default_rng(0)
    assert detect_ramps(np.zeros(64), min_delta=1.0) == []
    assert detect_ramps(rng.normal(0, 0.3, 64), min_delta=1.5) == []


def test_downward_ramp_with_nans():
    v = np.concatenate([np.full(8, np.nan), np.linspace(10, 7, 16), np.full(8, 7.0)])
    ramps = detect_ramps(v, min_delta=1.5)
    assert ramps and ramps[0].direction == "down"


def _sweep_signal(seconds: float, sweep_start: float, sweep_end: float, f0: float, f1: float) -> np.ndarray:
    n = int(seconds * SR)
    x = sum(_saw(f, n) for f in (110.0, 165.0, 220.0)) * 0.2
    t = np.arange(n) / SR
    frac = np.clip((t - sweep_start) / (sweep_end - sweep_start), 0, 1)
    cutoff = f0 * (f1 / f0) ** frac
    cutoff = np.where(t < sweep_start, f0, np.where(t > sweep_end, FILTER_OPEN_HZ, cutoff))
    return _lowpass_sweep(x, cutoff).astype(np.float32)


def test_filter_automation_tracks_sweep():
    # 120 BPM: Sweep von Beat 16 bis 48 (8 s bis 24 s), 200 Hz -> 8 kHz
    y = _sweep_signal(40.0, 8.0, 24.0, 200.0, 8000.0)
    curves = stem_curves(y, grid_for(40.0))
    auto = filter_automation(curves)
    assert auto is not None
    assert auto["device"] == "Auto Filter" and auto["parameter"] == "Frequency" and auto["unit"] == "Hz"
    ramp = auto["ramps"][0]
    assert ramp["direction"] == "up"
    assert 8 <= ramp["start_beat"] <= 24 and 40 <= ramp["end_beat"] <= 52
    values = {p["beat"]: p["value"] for p in auto["points"]}
    early = [v for b, v in values.items() if 18 <= b <= 24]
    assert early and max(early) < 2000
    assert auto["points"][-1]["value"] == FILTER_OPEN_HZ


def test_steady_signal_has_no_filter_or_gain_automation():
    n = 30 * SR
    y = (sum(_saw(f, n) for f in (110.0, 220.0)) * 0.2).astype(np.float32)
    curves = stem_curves(y, grid_for(30.0))
    assert filter_automation(curves) is None
    assert gain_automation(curves) is None
    assert sidechain_hint(y, grid_for(30.0), curves.active) is None


def test_gain_automation_detects_fade():
    n = 32 * SR
    y = (np.sin(2 * np.pi * 220 * np.arange(n) / SR) * 0.5).astype(np.float32)
    fade = np.ones(n)
    fade[16 * SR:] = 10 ** (np.linspace(0, -24, 16 * SR) / 20)
    curves = stem_curves((y * fade).astype(np.float32), grid_for(32.0))
    auto = gain_automation(curves)
    assert auto is not None and auto["unit"] == "dB" and auto["device"] == "Utility"
    assert auto["ramps"][0]["direction"] == "down"
    assert min(p["value"] for p in auto["points"]) < -12
    assert all(p["value"] <= 0 for p in auto["points"])


def test_sidechain_pump_detected():
    n = 30 * SR
    t = np.arange(n) / SR
    phase = np.mod(t / 0.5, 1.0)
    pump = 0.1 + 0.9 * np.minimum(1.0, phase / 0.4)
    y = (np.sin(2 * np.pi * 220 * t) * pump * 0.5).astype(np.float32)
    grid = grid_for(30.0)
    hint = sidechain_hint(y, grid, stem_curves(y, grid).active)
    assert hint is not None and hint["depth_db"] > 6
