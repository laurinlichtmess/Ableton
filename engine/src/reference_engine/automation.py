"""Automationskurven pro Stem: Filter-Cutoff (spektraler Rolloff), Lautstaerke (RMS), Sidechain-Hinweise."""

from __future__ import annotations

from dataclasses import dataclass

import librosa
import numpy as np
from scipy.ndimage import median_filter

from .audio import ANALYSIS_SR, HOP, db
from .tempo import BeatGrid

FILTER_OPEN_HZ = 20000.0
FILTER_MIN_HZ = 30.0
SILENCE_DB = -40.0  # relativ zum lauten Pegel des Stems


@dataclass
class Ramp:
    start: int  # Index (Beat) inklusive
    end: int  # Index (Beat) exklusiv
    start_value: float
    end_value: float

    @property
    def direction(self) -> str:
        return "up" if self.end_value > self.start_value else "down"


@dataclass
class StemCurves:
    rms_db: np.ndarray  # pro Beat
    cutoff_hz: np.ndarray  # pro Beat (NaN wo still)
    active: np.ndarray  # bool pro Beat
    level_db: float  # 95. Perzentil (lauter Pegel)


def per_beat(x: np.ndarray, grid: BeatGrid, sr: int, hop: int, fn=np.median) -> np.ndarray:
    n = grid.num_beats
    if n <= 0:
        return np.zeros(0)
    edges = librosa.time_to_frames(grid.beat_to_sec(np.arange(n + 1)), sr=sr, hop_length=hop)
    edges = np.clip(edges, 0, len(x))
    out = np.zeros(n)
    for i in range(n):
        a, b = edges[i], max(edges[i + 1], edges[i] + 1)
        seg = x[a:b]
        out[i] = fn(seg) if seg.size else (x[-1] if len(x) else 0.0)
    return out


def stem_curves(y: np.ndarray, grid: BeatGrid, sr: int = ANALYSIS_SR, hop: int = HOP) -> StemCurves:
    return curves_from_mag(np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)), grid, sr, hop)


def curves_from_mag(S: np.ndarray, grid: BeatGrid, sr: int = ANALYSIS_SR, hop: int = HOP) -> StemCurves:
    """Kurven aus einem Betragsspektrum (n_fft=2048), z. B. einem maskierten Element."""
    rms = librosa.feature.rms(S=S, frame_length=2048)[0]
    rolloff = librosa.feature.spectral_rolloff(S=S, sr=sr, n_fft=2048, roll_percent=0.9)[0]
    rms_db = db(per_beat(rms, grid, sr, hop, np.mean))
    level = float(np.percentile(rms_db, 95)) if rms_db.size else -100.0
    active = rms_db > level + SILENCE_DB
    cutoff = per_beat(rolloff, grid, sr, hop)
    cutoff = np.clip(cutoff, FILTER_MIN_HZ, FILTER_OPEN_HZ)
    if cutoff.size >= 3:
        cutoff = np.exp(median_filter(np.log(cutoff), size=3, mode="nearest"))
    cutoff = np.where(active, cutoff, np.nan)
    return StemCurves(rms_db=rms_db, cutoff_hz=cutoff, active=active, level_db=level)


def detect_ramps(values: np.ndarray, min_delta: float, lengths=(8, 16, 32, 64), step: int = 4,
                 min_corr: float = 0.85, min_monotonic: float = 0.65, max_step_frac: float = 0.4) -> list[Ramp]:
    """Monotone Rampen (Sweeps/Fades) finden; `values` in log-/dB-Einheiten, NaN = unbekannt.

    Spruenge (z. B. Instrumentwechsel an einer Abschnittsgrenze) sind keine Rampen: kein einzelner
    Schritt darf mehr als `max_step_frac` der Gesamtaenderung ausmachen.
    """
    v = np.asarray(values, dtype=float)
    n = len(v)
    candidates: list[tuple[float, Ramp]] = []
    for L in lengths:
        for s in range(0, n - L + 1, step):
            seg = v[s:s + L]
            if np.isnan(seg).mean() > 0.1:
                continue
            seg = np.where(np.isnan(seg), np.nanmedian(seg), seg)
            head, tail = np.mean(seg[:2]), np.mean(seg[-2:])
            delta = tail - head
            if abs(delta) < min_delta or np.std(seg) < 1e-9:
                continue
            r = np.corrcoef(np.arange(L), seg)[0, 1]
            diffs = np.diff(seg)
            mono = np.mean(np.sign(diffs) == np.sign(delta)) + 0.5 * np.mean(diffs == 0)
            if abs(r) < min_corr or mono < min_monotonic:
                continue
            if np.max(np.abs(diffs)) > max_step_frac * abs(delta):
                continue
            # Flache Enden abschneiden, damit die Rampe dort beginnt/endet, wo sich der Wert bewegt.
            moving = np.nonzero(diffs * np.sign(delta) > 0.3 * abs(delta) / L)[0]
            if moving.size == 0:
                continue
            a, b = int(moving[0]), int(moving[-1]) + 2
            trimmed = seg[a:b]
            if len(trimmed) < 4:
                continue
            t_head, t_tail = float(np.mean(trimmed[:2])), float(np.mean(trimmed[-2:]))
            t_r = abs(np.corrcoef(np.arange(len(trimmed)), trimmed)[0, 1])
            candidates.append((abs(t_tail - t_head) * t_r ** 2, Ramp(s + a, s + b, t_head, t_tail)))
    chosen: list[Ramp] = []
    for _, ramp in sorted(candidates, key=lambda c: -c[0]):
        if all(ramp.end <= c.start or ramp.start >= c.end for c in chosen):
            chosen.append(ramp)
    return sorted(chosen, key=lambda r: r.start)


def simplify_points(beats: np.ndarray, values: np.ndarray, rel_tol: float = 0.0, abs_tol: float = 0.0) -> list[dict]:
    pts: list[dict] = []
    last = None
    for b, val in zip(beats, values):
        if last is not None and abs(val - last) <= max(abs_tol, rel_tol * abs(last)):
            continue
        pts.append({"beat": round(float(b), 3), "value": round(float(val), 2)})
        last = val
    return pts


def filter_automation(curves: StemCurves, min_octaves: float = 1.5) -> dict | None:
    """Auto-Filter-Kurve: offen, ausser in erkannten Cutoff-Sweeps bzw. deutlich gefilterten Bereichen."""
    c = curves.cutoff_hz
    if c.size == 0 or np.all(np.isnan(c)):
        return None
    log2 = np.log2(c)
    ramps = detect_ramps(log2, min_delta=min_octaves)
    if not ramps:
        return None

    ref = float(np.nanpercentile(log2, 90))
    target = np.full(c.shape, FILTER_OPEN_HZ)
    filtered = np.zeros(c.shape, dtype=bool)
    for r in ramps:
        filtered[r.start:r.end] = True
    # Gefilterte Plateaus direkt vor/nach einem Sweep mitnehmen (z. B. Breakdown mit geschlossenem Filter).
    closed = np.nan_to_num(log2, nan=ref) < ref - min_octaves
    for r in ramps:
        i = r.start - 1
        while i >= 0 and closed[i]:
            filtered[i] = True
            i -= 1
        i = r.end
        while i < len(c) and closed[i]:
            filtered[i] = True
            i += 1
    fill = np.where(np.isnan(c), FILTER_OPEN_HZ, c)
    target[filtered] = fill[filtered]
    for r in ramps:
        if r.direction == "up" and r.end < len(target) and not filtered[r.end]:
            target[r.end] = FILTER_OPEN_HZ

    beats = np.arange(len(target), dtype=float)
    return {
        "target": "filter_cutoff",
        "device": "Auto Filter",
        "class_name": "AutoFilter",
        "parameter": "Frequency",
        "unit": "Hz",
        "points": simplify_points(beats, target, rel_tol=0.04),
        "ramps": [
            {"start_beat": r.start, "end_beat": r.end, "from": round(2 ** r.start_value, 1),
             "to": round(2 ** r.end_value, 1), "direction": r.direction}
            for r in ramps
        ],
    }


def gain_automation(curves: StemCurves, min_db: float = 6.0, exclude: list[dict] | None = None,
                    max_below_level_db: float = 12.0) -> dict | None:
    """Utility-Gain-Kurve: 0 dB, ausser in erkannten Fades (Ein-/Ausblenden ueber mehrere Takte).

    `exclude`: Filter-Rampen desselben Stems; ein Pegelanstieg waehrend eines Sweeps ist kein Fade.
    """
    v = curves.rms_db
    if v.size == 0:
        return None
    smooth = median_filter(v, size=3, mode="nearest") if v.size >= 3 else v
    floor = curves.level_db + SILENCE_DB
    ramps = detect_ramps(np.where(smooth > floor, smooth, np.nan), min_delta=min_db, min_corr=0.9)
    ramps = [r for r in ramps if max(r.start_value, r.end_value) >= curves.level_db - max_below_level_db]
    for ex in exclude or []:
        ramps = [r for r in ramps if r.end <= ex["start_beat"] or r.start >= ex["end_beat"]]
    if not ramps:
        return None
    gain = np.zeros(v.shape)
    for r in ramps:
        loud = max(r.start_value, r.end_value)
        gain[r.start:r.end] = np.clip(smooth[r.start:r.end] - loud, -36.0, 0.0)
    beats = np.arange(len(gain), dtype=float)
    return {
        "target": "gain",
        "device": "Utility",
        "class_name": "StereoGain",
        "parameter": "Gain",
        "unit": "dB",
        "points": simplify_points(beats, gain, abs_tol=0.75),
        "ramps": [
            {"start_beat": r.start, "end_beat": r.end, "from": round(r.start_value, 1), "to": round(r.end_value, 1),
             "direction": r.direction}
            for r in ramps
        ],
    }


def sidechain_hint(y: np.ndarray, grid: BeatGrid, active: np.ndarray, sr: int = ANALYSIS_SR,
                   bins_per_beat: int = 16, min_depth_db: float = 4.0) -> dict | None:
    """Erkennt beat-synchrones Pumpen (Pegel-Einbruch direkt nach jedem Beat)."""
    hop = 128
    rms = librosa.feature.rms(y=y, frame_length=512, hop_length=hop)[0]
    t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    beat_pos = grid.sec_to_beat(t)
    valid = beat_pos >= 0
    beat_idx = np.floor(beat_pos).astype(int)
    if active.size:
        valid &= beat_idx < active.size
        valid[valid] &= active[beat_idx[valid]]
    if valid.sum() < bins_per_beat * 16:
        return None
    phase = np.mod(beat_pos[valid], 1.0)
    level = db(rms[valid])
    bins = np.minimum((phase * bins_per_beat).astype(int), bins_per_beat - 1)
    folded = np.array([np.median(level[bins == b]) if np.any(bins == b) else np.nan for b in range(bins_per_beat)])
    if np.isnan(folded).any():
        return None
    # Pumpen = Einbruch rund um den Beat (Fenster -1/4 .. +5/16 Beat, wegen Analysefenster-Unschaerfe),
    # Erholung in der zweiten Beat-Haelfte.
    q = bins_per_beat // 4
    window = np.concatenate([folded[-q:], folded[:bins_per_beat * 5 // 16 + 1]])
    late = folded[int(bins_per_beat * 0.4):int(bins_per_beat * 0.85)]
    depth = float(np.median(late) - np.min(window))
    if depth < min_depth_db:
        return None
    dip = int(np.argmin(window)) - q
    rolled = np.roll(folded, -dip)
    recovered = np.nonzero(rolled >= np.median(late) - 1.0)[0]
    release = (int(recovered[0]) if recovered.size else bins_per_beat) / bins_per_beat
    return {"type": "sidechain_pump", "depth_db": round(depth, 1), "release_beats": round(release, 3)}
