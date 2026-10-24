"""Songteile: Takt-Features, Segmentierung auf dem Phrasenraster und Benennung ueber Elemente.

Segmentierung: dynamische Programmierung ueber Grenzen auf einem 4-Takt-Raster (Phrasen-Versatz wird
geschaetzt). Kosten = Streuung der Takt-Merkmale innerhalb eines Teils + Strafe pro Teil (BIC-artig,
skaliert mit dem Takt-zu-Takt-Rauschen) + leichte Strafe fuer unuebliche Laengen (bevorzugt 8/16/32
Takte). Hauptmerkmal ist, welche Elemente (Kick, Bass, Hats, ...) pro Takt spielen.

Benennung: Intro/Outro = Teile vor dem ersten bzw. nach dem letzten vollen Teil (Kick + Bass),
Breakdown = ohne Kick, Build = ansteigende Energie/Rauschen direkt vor einem vollen Teil,
Drop = voller Teil nach Breakdown/Build, sonst Main; Groove = Kick ohne Bass mitten im Track.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import librosa
import numpy as np

from .audio import ANALYSIS_SR, HOP, db
from .tempo import BeatGrid

PREFERRED_LENGTHS = (8, 16, 32)
OK_LENGTHS = (4, 12, 24, 48, 64)
ELEMENT_WEIGHT = 2.0
MERGE_MAX_BARS = 64
MERGE_MAX_DB = 1.5


@dataclass
class BarFeatures:
    timbre: np.ndarray  # (D, B) z-normalisierte Merkmale (MFCC + Chroma)
    rms_db: np.ndarray  # (B,)
    onset_density: np.ndarray  # (B,)
    low_db: np.ndarray  # (B,)
    centroid: np.ndarray  # (B,) Hz
    high_db: np.ndarray | None = None  # (B,) Energie > 4 kHz (Rauschen/Riser)

    @property
    def num_bars(self) -> int:
        return int(self.rms_db.shape[0])


@dataclass
class ElementBars:
    """Pro Element: vorhanden (bool) und Staerke (0..1) pro Takt."""

    present: dict[str, np.ndarray]
    strength: dict[str, np.ndarray]

    def names(self) -> list[str]:
        return list(self.present)


@dataclass
class Section:
    index: int
    start_bar: int
    end_bar: int
    label: str = "Part"
    group: str = "A"
    kind: str = "main"
    energy: float = 0.0
    trend_db_per_bar: float = 0.0
    elements: list[str] = field(default_factory=list)
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
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
    high = np.sqrt(np.mean(S[freqs > 4000.0] ** 2, axis=0))
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
        high_db=db(_aggregate(high, edges)[0]),
    )


def feature_matrix(feat: BarFeatures, elements: ElementBars | None) -> np.ndarray:
    """(B, F) Merkmale pro Takt: Elemente stark gewichtet, Pegel/Klangfarbe schwaecher."""
    B = feat.num_bars
    cols = []
    if elements:
        for name in elements.names():
            s = np.asarray(elements.strength[name], dtype=float)[:B]
            cols.append(ELEMENT_WEIGHT * np.pad(s, (0, B - len(s))))
    rms = feat.rms_db
    cols.append((rms - rms.mean()) / (rms.std() + 1.0))
    if feat.high_db is not None:
        h = feat.high_db
        cols.append(0.5 * (h - h.mean()) / (h.std() + 1.0))
    X = np.column_stack(cols) if cols else np.zeros((B, 0))
    timbre = feat.timbre.T * (1.5 / np.sqrt(max(1, feat.timbre.shape[0])))
    return np.hstack([X, timbre])


def _noise_var(X: np.ndarray) -> float:
    if len(X) < 3:
        return 1.0
    d = np.sum(np.diff(X, axis=0) ** 2, axis=1) / 2.0
    return float(np.median(d))


def phrase_offset(X: np.ndarray, period: int = 4) -> int:
    """Versatz (in Takten) des Phrasenrasters: wo setzen Aenderungen bevorzugt ein?"""
    if len(X) < 4 * period:
        return 0
    nov = np.zeros(len(X))
    nov[1:] = np.sqrt(np.sum(np.diff(X, axis=0) ** 2, axis=1))
    scores = np.array([nov[o::period][1:].mean() if len(nov[o::period]) > 1 else 0.0 for o in range(period)])
    best = int(np.argmax(scores))
    return best if scores[best] > 1.2 * scores[0] else 0


def _length_penalty(L: int, edge: bool) -> float:
    if L in PREFERRED_LENGTHS:
        return 0.0
    if L in OK_LENGTHS or (edge and L < 8):
        return 0.25
    return 0.5


def find_boundaries(X: np.ndarray, kappa: float = 1.0, min_bars: int = 8) -> list[int]:
    B = len(X)
    if B < 2 * min_bars:
        return [0, B]
    F = X.shape[1]
    sigma2 = max(_noise_var(X), 0.02 * F)
    lam = kappa * sigma2 * F * np.log(B) / 4.0 + 1.0
    o = phrase_offset(X)
    pos = sorted({0, B, *range(o, B, 4)})
    pos = [p for p in pos if p == 0 or p == B or 4 <= p <= B - 4]

    cs = np.vstack([np.zeros((1, F)), np.cumsum(X, axis=0)])
    cs2 = np.concatenate([[0.0], np.cumsum(np.sum(X ** 2, axis=1))])

    def sse(a: int, b: int) -> float:
        n = b - a
        s = cs[b] - cs[a]
        return float(cs2[b] - cs2[a] - s @ s / n)

    best = {0: (0.0, -1)}
    for j in pos[1:]:
        cand = []
        for i in pos:
            if i >= j or i not in best:
                continue
            L = j - i
            first, last = i == 0, j == B
            if L < (4 if (first or last) else min_bars):
                continue
            core = L - (B - (o + 4 * ((B - o) // 4))) if last else L  # angefangener Schlusstakt-Rest
            cost = best[i][0] + sse(i, j) + lam * (1.0 + _length_penalty(core, first or last))
            cand.append((cost, i))
        if cand:
            best[j] = min(cand)
    if B not in best:
        return [0, B]
    out = [B]
    while out[-1] != 0:
        out.append(best[out[-1]][1])
    return out[::-1]


def _section_elements(elements: ElementBars | None, a: int, b: int) -> list[str]:
    if not elements:
        return []
    return [n for n in elements.names() if np.mean(elements.present[n][a:b]) >= 0.35]


def _slope(x: np.ndarray) -> float:
    return float(np.polyfit(np.arange(len(x)), x, 1)[0]) if len(x) >= 2 else 0.0


def merge_similar(bounds: list[int], feat: BarFeatures, elements: ElementBars | None) -> list[int]:
    """Benachbarte Teile mit gleichen Elementen und aehnlichem Pegel zusammenfassen."""
    if not elements:
        return bounds
    out = list(bounds)
    changed = True
    while changed:
        changed = False
        for k in range(1, len(out) - 1):
            a, m, b = out[k - 1], out[k], out[k + 1]
            if b - a > MERGE_MAX_BARS:
                continue
            same = _section_elements(elements, a, m) == _section_elements(elements, m, b)
            close = abs(np.mean(feat.rms_db[a:m]) - np.mean(feat.rms_db[m:b])) < MERGE_MAX_DB
            rising = _slope(feat.rms_db[a:b]) > 0.4
            if same and close and not rising:
                del out[k]
                changed = True
                break
    return out


def _riser(feat: BarFeatures, a: int, b: int) -> float:
    """Anstieg (dB/Takt) von Pegel bzw. Hochband-Rauschen in den letzten <= 8 Takten."""
    a2 = max(a, b - 8)
    slopes = [_slope(feat.rms_db[a2:b])]
    if feat.high_db is not None:
        slopes.append(_slope(feat.high_db[a2:b]))
    return max(slopes)


def label_sections(sections: list[Section], feat: BarFeatures, elements: ElementBars | None = None) -> list[Section]:
    """Setzt kind/label/energy/elements; kann einen Breakdown in Breakdown + Build teilen."""
    if not sections:
        return sections
    for s in sections:
        s.elements = _section_elements(elements, s.start_bar, s.end_bar)
        s.trend_db_per_bar = _slope(feat.rms_db[s.start_bar:s.end_bar])

    # Breakdown mit Anstieg am Ende vor einem vollen Teil: letzte 8 Takte als Build abtrennen.
    split: list[Section] = []
    for i, s in enumerate(sections):
        nxt = sections[i + 1] if i + 1 < len(sections) else None
        if (nxt is not None and "kick" not in s.elements and "kick" in nxt.elements and s.bars >= 16
                and _riser(feat, s.end_bar - 8, s.end_bar) > 0.5 and _slope(feat.rms_db[s.start_bar:s.end_bar - 8]) < 0.3):
            head = Section(0, s.start_bar, s.end_bar - 8, elements=_section_elements(elements, s.start_bar, s.end_bar - 8))
            tail = Section(0, s.end_bar - 8, s.end_bar, elements=_section_elements(elements, s.end_bar - 8, s.end_bar))
            for t in (head, tail):
                t.trend_db_per_bar = _slope(feat.rms_db[t.start_bar:t.end_bar])
            split += [head, tail]
        else:
            split.append(s)
    sections = split
    for i, s in enumerate(sections):
        s.index = i

    lvl = np.array([np.mean(feat.rms_db[s.start_bar:s.end_bar]) for s in sections])
    span = lvl.max() - lvl.min()
    rel = (lvl - lvl.min()) / span if span >= 3.0 else np.full(len(sections), 0.5)
    for s, e in zip(sections, rel):
        s.energy = float(e)

    has_elements = bool(elements)
    track_has_bass = any("bass" in s.elements for s in sections)

    def full(s: Section) -> bool:
        if not has_elements:
            return s.energy >= 0.6
        return "kick" in s.elements and ("bass" in s.elements or not track_has_bass) and s.energy >= 0.35

    is_full = [full(s) for s in sections]
    if not any(is_full):
        is_full = [s.energy >= 0.6 for s in sections]
    counts = [len(s.elements) for s in sections]
    max_count = max((c for c, f in zip(counts, is_full) if f), default=max(counts))
    first_full = is_full.index(True) if any(is_full) else 0
    last_full = len(is_full) - 1 - is_full[::-1].index(True) if any(is_full) else len(is_full) - 1
    # Ein voller, aber deutlich duennerer Schlussteil ist trotzdem Outro (z. B. ohne Lead/Pads).
    while last_full > first_full and has_elements and (
            counts[last_full] <= max_count - 2 or sections[last_full].trend_db_per_bar < -0.6):
        last_full -= 1
    while first_full < last_full and has_elements and counts[first_full] <= max_count - 2 and first_full == 0:
        first_full += 1

    n = len(sections)
    kinds = []
    for i, s in enumerate(sections):
        kick = "kick" in s.elements if has_elements else s.energy >= 0.5
        if n > 1 and i < first_full:
            kind = "intro"
        elif n > 2 and i > last_full:
            kind = "outro"
        elif is_full[i] or (not has_elements and kick):
            kind = "drop" if kinds and kinds[-1] in ("breakdown", "build") else "main"
        elif not kick:
            kind = "breakdown"
        else:
            kind = "groove"
        kinds.append(kind)
    for i in range(n - 1):
        # Build nur bei klarem Anstieg; ein flacher Breakdown vor dem Drop bleibt Breakdown.
        rising = sections[i].trend_db_per_bar > 0.5 or _riser(feat, sections[i].start_bar, sections[i].end_bar) > 0.7
        if kinds[i] in ("breakdown", "intro", "groove") and kinds[i + 1] in ("drop", "main") and rising:
            # Lange flache Teile ohne Kick sind Breakdowns, auch wenn das Hochband leicht zickt.
            if kinds[i] == "breakdown" and sections[i].bars >= 8 and sections[i].trend_db_per_bar < 0.35:
                continue
            kinds[i] = "build"
            if kinds[i + 1] == "main":
                kinds[i + 1] = "drop"
    names = {"intro": "Intro", "outro": "Outro", "main": "Main", "drop": "Drop", "breakdown": "Breakdown",
             "build": "Build", "groove": "Groove"}
    totals = {k: kinds.count(k) for k in set(kinds)}
    seen: dict[str, int] = {}
    prev: list[str] = []
    for s, kind in zip(sections, kinds):
        s.kind = kind
        if totals[kind] > 1 and kind not in ("intro", "outro"):
            seen[kind] = seen.get(kind, 0) + 1
            s.label = f"{names[kind]} {seen[kind]}"
        else:
            s.label = names[kind]
        s.added = [e for e in s.elements if e not in prev] if s.index else []
        s.removed = [e for e in prev if e not in s.elements]
        prev = s.elements
    _group_sections(sections, feat, elements)
    return sections


def _group_sections(sections: list[Section], feat: BarFeatures, elements: ElementBars | None,
                    threshold: float = 0.9) -> None:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    prototypes: list[np.ndarray] = []
    for s in sections:
        parts = [feat.timbre[:, s.start_bar:s.end_bar].mean(axis=1) * 0.5, [s.energy * 2.0]]
        if elements:
            parts.append([2.0 * float(np.mean(elements.strength[n][s.start_bar:s.end_bar])) for n in elements.names()])
        v = np.concatenate(parts)
        v = v / (np.linalg.norm(v) + 1e-9)
        sims = [float(v @ p) for p in prototypes]
        if sims and max(sims) >= threshold:
            s.group = letters[int(np.argmax(sims)) % 26]
        else:
            prototypes.append(v)
            s.group = letters[(len(prototypes) - 1) % 26]


def segment_song(feat: BarFeatures, elements: ElementBars | None = None, min_bars: int = 8) -> list[Section]:
    X = feature_matrix(feat, elements)
    bounds = find_boundaries(X, min_bars=min_bars)
    bounds = merge_similar(bounds, feat, elements)
    sections = [Section(index=i, start_bar=a, end_bar=b) for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:]))]
    return label_sections(sections, feat, elements)
