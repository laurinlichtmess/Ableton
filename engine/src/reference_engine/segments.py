"""Songteile: Takt-Features, Novelty-Segmentierung und Benennung."""

from __future__ import annotations

from dataclasses import dataclass, field

import librosa
import numpy as np

from .audio import ANALYSIS_SR, HOP, db
from .tempo import BeatGrid


@dataclass
class BarFeatures:
    timbre: np.ndarray  # (D, B) z-normalisierte Merkmale (MFCC + Chroma)
    rms_db: np.ndarray  # (B,)
    onset_density: np.ndarray  # (B,)
    low_db: np.ndarray  # (B,)
    centroid: np.ndarray  # (B,) Hz

    @property
    def num_bars(self) -> int:
        return int(self.rms_db.shape[0])


@dataclass
class Section:
    index: int
    start_bar: int
    end_bar: int
    label: str = "Part"
    group: str = "A"
    energy: float = 0.0
    trend_db_per_bar: float = 0.0
    extra: dict = field(default_factory=dict)

    @property
    def bars(self) -> int:
        return self.end_bar - self.start_bar


def _bar_frames(grid: BeatGrid, n_frames: int, sr: int, hop: int) -> np.ndarray:
    times = grid.first_downbeat_sec + np.arange(grid.num_bars + 1) * grid.bar_sec
    frames = librosa.time_to_frames(times, sr=sr, hop_length=hop)
    return np.clip(frames, 0, n_frames)


def _aggregate(x: np.ndarray, edges: np.ndarray, fn=np.mean) -> np.ndarray:
    x = np.atleast_2d(x)
    out = np.zeros((x.shape[0], len(edges) - 1), dtype=float)
    for i in range(len(edges) - 1):
        a, b = edges[i], max(edges[i + 1], edges[i] + 1)
        seg = x[:, a:b]
        out[:, i] = fn(seg, axis=1) if seg.shape[1] else 0.0
    return out


def _znorm(x: np.ndarray) -> np.ndarray:
    mu = x.mean(axis=1, keepdims=True)
    sd = x.std(axis=1, keepdims=True) + 1e-9
    return (x - mu) / sd


def bar_features(y: np.ndarray, grid: BeatGrid, sr: int = ANALYSIS_SR, hop: int = HOP) -> BarFeatures:
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    n_frames = S.shape[1]
    edges = _bar_frames(grid, n_frames, sr, hop)

    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(librosa.feature.melspectrogram(S=S**2, sr=sr)), n_mfcc=13)
    chroma = librosa.feature.chroma_stft(S=S**2, sr=sr)
    rms = librosa.feature.rms(S=S, frame_length=2048)[0]
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low = np.sqrt(np.mean(S[freqs < 150.0] ** 2, axis=0))
    centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
    onset_env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S), sr=sr)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop, units="frames")
    onset_track = np.zeros(n_frames)
    onset_track[np.clip(onsets, 0, n_frames - 1)] = 1.0

    timbre = np.vstack([_aggregate(mfcc[1:], edges), _aggregate(chroma, edges)])
    return BarFeatures(
        timbre=_znorm(timbre),
        rms_db=db(_aggregate(rms, edges)[0]),
        onset_density=_aggregate(onset_track, edges, np.sum)[0],
        low_db=db(_aggregate(low, edges)[0]),
        centroid=_aggregate(centroid, edges)[0],
    )


def _checkerboard_novelty(X: np.ndarray, half: int) -> np.ndarray:
    B = X.shape[1]
    norm = X / (np.linalg.norm(X, axis=0, keepdims=True) + 1e-9)
    ssm = norm.T @ norm
    nov = np.zeros(B)
    for i in range(1, B):
        a0, b1 = max(0, i - half), min(B, i + half)
        past, fut = slice(a0, i), slice(i, b1)
        within = 0.5 * (ssm[past, past].mean() + ssm[fut, fut].mean())
        across = ssm[past, fut].mean()
        nov[i] = max(0.0, within - across)
    return nov


def _energy_novelty(rms_db: np.ndarray, half: int) -> np.ndarray:
    B = len(rms_db)
    nov = np.zeros(B)
    for i in range(1, B):
        past = rms_db[max(0, i - half):i]
        fut = rms_db[i:min(B, i + half)]
        nov[i] = abs(np.median(fut) - np.median(past))
    return nov


def _phrase_weight(bar: int) -> float:
    if bar % 8 == 0:
        return 1.0
    if bar % 4 == 0:
        return 0.9
    if bar % 2 == 0:
        return 0.55
    return 0.35


def novelty_curve(feat: BarFeatures, half: int = 4) -> np.ndarray:
    tn = _checkerboard_novelty(feat.timbre, half)
    en = _energy_novelty(feat.rms_db, half)
    dn = _energy_novelty(feat.onset_density, half)
    parts = [c / c.max() for c in (tn, en, dn) if c.max() > 1e-9]
    if not parts:
        return np.zeros(feat.num_bars)
    weights = [0.4, 0.4, 0.2][: len(parts)]
    return sum(w * p for w, p in zip(weights, parts)) / sum(weights)


def find_boundaries(feat: BarFeatures, min_bars: int = 4, max_sections: int | None = None) -> list[int]:
    B = feat.num_bars
    if B < 2 * min_bars:
        return [0, B]
    nov = novelty_curve(feat)
    weighted = np.array([nov[i] * _phrase_weight(i) for i in range(B)])
    weighted[:min_bars] = 0.0
    weighted[B - min_bars + 1:] = 0.0
    if weighted.max() <= 0:
        return [0, B]
    threshold = 0.2 * weighted.max()
    max_sections = max_sections or max(1, B // min_bars)
    padded = np.concatenate([[0.0], weighted, [0.0]])
    is_peak = (padded[1:-1] >= padded[:-2]) & (padded[1:-1] >= padded[2:])

    chosen: list[int] = []
    for i in np.argsort(-weighted):
        if weighted[i] < threshold or len(chosen) >= max_sections - 1:
            break
        if not is_peak[i]:
            continue
        if all(abs(int(i) - c) >= min_bars for c in chosen) and int(i) <= B - min_bars:
            chosen.append(int(i))
    return [0, *sorted(chosen), B]


def _group_sections(sections: list[Section], feat: BarFeatures, threshold: float = 0.8) -> None:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    prototypes: list[np.ndarray] = []
    for s in sections:
        v = np.concatenate([feat.timbre[:, s.start_bar:s.end_bar].mean(axis=1), [s.energy * 3.0]])
        v = v / (np.linalg.norm(v) + 1e-9)
        sims = [float(v @ p) for p in prototypes]
        if sims and max(sims) >= threshold:
            s.group = letters[int(np.argmax(sims)) % 26]
        else:
            prototypes.append(v)
            s.group = letters[(len(prototypes) - 1) % 26]


def label_sections(sections: list[Section], feat: BarFeatures) -> None:
    if not sections:
        return
    lvl = np.array([np.mean(feat.rms_db[s.start_bar:s.end_bar]) for s in sections])
    dens = np.array([np.mean(feat.onset_density[s.start_bar:s.end_bar]) for s in sections])
    low = np.array([np.mean(feat.low_db[s.start_bar:s.end_bar]) for s in sections])

    def rel(x):
        span = x.max() - x.min()
        return (x - x.min()) / span if span > 1e-6 else np.full_like(x, 0.5)

    score = 0.55 * rel(lvl) + 0.2 * rel(dens) + 0.25 * rel(low)
    if lvl.max() - lvl.min() < 3.0:
        score = np.full_like(score, 0.5)
    for s, e in zip(sections, score):
        s.energy = float(e)
        bars = feat.rms_db[s.start_bar:s.end_bar]
        s.trend_db_per_bar = float(np.polyfit(np.arange(len(bars)), bars, 1)[0]) if len(bars) >= 2 else 0.0

    n = len(sections)
    labels = ["Main"] * n
    for i, s in enumerate(sections):
        if s.energy >= 0.7:
            labels[i] = "Drop"
        elif s.energy <= 0.4:
            labels[i] = "Breakdown"
    for i in range(n - 1):
        rising = sections[i].trend_db_per_bar > 0.5
        mid_energy_jump = labels[i] == "Main" and sections[i + 1].energy - sections[i].energy > 0.3
        if labels[i + 1] == "Drop" and labels[i] != "Drop" and (rising or mid_energy_jump):
            labels[i] = "Build"
    if n > 1 and sections[0].energy < 0.6:
        labels[0] = "Intro"
    if n > 2 and sections[-1].energy < 0.6:
        labels[-1] = "Outro"

    counts = {lab: labels.count(lab) for lab in set(labels)}
    seen: dict[str, int] = {}
    for s, lab in zip(sections, labels):
        if counts[lab] > 1 and lab not in ("Intro", "Outro"):
            seen[lab] = seen.get(lab, 0) + 1
            s.label = f"{lab} {seen[lab]}"
        else:
            s.label = lab
    _group_sections(sections, feat)


def segment_song(feat: BarFeatures, min_bars: int = 4) -> list[Section]:
    bounds = find_boundaries(feat, min_bars=min_bars)
    sections = [Section(index=i, start_bar=a, end_bar=b) for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:]))]
    label_sections(sections, feat)
    return sections
