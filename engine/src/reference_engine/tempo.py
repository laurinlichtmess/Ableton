"""Tempo, Beatgrid und Taktanfang (4/4) bestimmen.

Live arbeitet mit konstantem Tempo, daher wird ein konstantes Raster (BPM + Phase) fuer den ganzen
Track bestimmt. Beat 0 im Ergebnis entspricht dem ersten erkannten Taktanfang; das ist die
Arrangement-Position 1.1.1 in Live.

Vorgehen (statt librosa.beat_track, das bei dichter Percussion gern auf 2/3 oder 1/2 Tempo einrastet):

1. Onset-Huellkurven: tiefes Band (Kick) und Vollband.
2. Fourier-Tempogramm ueber den ganzen Track (lange FFT = sehr feine Frequenzaufloesung).
3. Jeder Tempokandidat wird mit seiner metrischen Hierarchie bewertet (Beat, Achtel, Sechzehntel,
   halbe Takte, Takte) und mit einem Prior fuer elektronische Musik (Zentrum 128 BPM) gewichtet.
   Optional schraenken ein BPM-Hinweis oder ein BPM-Bereich die Suche ein.
4. Feinabstimmung von Tempo und Phase direkt auf der Huellkurve, Taktanfang ueber Klangwechsel
   und Kick-Akzente auf den vier moeglichen Taktpositionen.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import librosa
import numpy as np
from scipy.ndimage import maximum_filter1d

from .audio import ANALYSIS_SR, HOP

MIN_BPM = 60.0
MAX_BPM = 200.0
PRIOR_CENTER_BPM = 128.0
PRIOR_SIGMA_OCT = 0.45
HINT_TOLERANCE = 0.06
LOW_HZ = 150.0
# Gewichte der metrischen Ebenen relativ zum Beat (Faktor auf die Beatfrequenz).
METRICAL_WEIGHTS = ((1.0, 1.0), (2.0, 0.5), (4.0, 0.25), (0.5, 0.5), (0.25, 0.35))
RELATED = {"1/2": 0.5, "2/3": 2 / 3, "3/4": 0.75, "4/3": 4 / 3, "3/2": 1.5, "2": 2.0}


@dataclass
class TempoOptions:
    bpm_min: float | None = None
    bpm_max: float | None = None
    bpm_hint: float | None = None

    def search_range(self) -> tuple[float, float]:
        if self.bpm_hint:
            return self.bpm_hint * (1 - HINT_TOLERANCE), self.bpm_hint * (1 + HINT_TOLERANCE)
        lo = self.bpm_min if self.bpm_min else MIN_BPM
        hi = self.bpm_max if self.bpm_max else MAX_BPM
        if lo > hi:
            lo, hi = hi, lo
        return max(20.0, lo), min(400.0, max(hi, lo + 1.0))

    def prior(self, bpm: np.ndarray) -> np.ndarray:
        if self.bpm_hint:
            center, sigma = self.bpm_hint, 0.05
        elif self.bpm_min or self.bpm_max:
            lo, hi = self.search_range()
            center, sigma = float(np.sqrt(lo * hi)), 1.0
        else:
            center, sigma = PRIOR_CENTER_BPM, PRIOR_SIGMA_OCT
        return np.exp(-0.5 * (np.log2(np.asarray(bpm) / center) / sigma) ** 2)

    @property
    def source(self) -> str:
        if self.bpm_hint:
            return "hint"
        if self.bpm_min or self.bpm_max:
            return "range"
        return "auto"


@dataclass
class BeatGrid:
    bpm: float
    first_downbeat_sec: float
    duration_sec: float
    confidence: float
    beats_per_bar: int = 4
    downbeat_confidence: float = 0.0
    candidates: list[dict] = field(default_factory=list)
    source: str = "auto"

    @property
    def beat_sec(self) -> float:
        return 60.0 / self.bpm

    @property
    def bar_sec(self) -> float:
        return self.beats_per_bar * self.beat_sec

    @property
    def num_beats(self) -> int:
        return max(0, int(np.floor((self.duration_sec - self.first_downbeat_sec) / self.beat_sec + 1e-6)))

    @property
    def num_bars(self) -> int:
        # Angefangener letzter Takt zaehlt, wenn mehr als die Haelfte vorhanden ist.
        bars = (self.duration_sec - self.first_downbeat_sec) / self.bar_sec
        return max(1, int(np.floor(bars + 0.5 - 1e-3)))

    def beat_to_sec(self, beat):
        return self.first_downbeat_sec + np.asarray(beat, dtype=float) * self.beat_sec

    def sec_to_beat(self, sec):
        return (np.asarray(sec, dtype=float) - self.first_downbeat_sec) / self.beat_sec

    def to_dict(self) -> dict:
        return {
            "bpm": round(float(self.bpm), 2),
            "confidence": round(float(self.confidence), 3),
            "time_signature": [self.beats_per_bar, 4],
            "first_downbeat_sec": round(float(self.first_downbeat_sec), 4),
            "beat_sec": round(float(self.beat_sec), 6),
            "bar_sec": round(float(self.bar_sec), 6),
            "num_bars": int(self.num_bars),
            "downbeat_confidence": round(float(self.downbeat_confidence), 3),
            "source": self.source,
            "candidates": self.candidates,
        }


@dataclass
class _Envelopes:
    low: np.ndarray
    full: np.ndarray
    mel_db: np.ndarray  # (bands, frames) fuer die Taktanfangs-Suche
    fps: float

    @property
    def combined(self) -> np.ndarray:
        return 0.7 * self.low + 0.3 * self.full


def _norm(x: np.ndarray) -> np.ndarray:
    ref = float(np.percentile(x, 99)) if x.size else 0.0
    return x / ref if ref > 1e-9 else np.zeros_like(x)


def _envelopes(y: np.ndarray, sr: int, hop: int) -> _Envelopes:
    mel = librosa.feature.melspectrogram(y=y, sr=sr, hop_length=hop, n_mels=64, fmax=sr / 2)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    freqs = librosa.mel_frequencies(n_mels=64, fmax=sr / 2)
    low = librosa.onset.onset_strength(S=mel_db[freqs < LOW_HZ], sr=sr, hop_length=hop)
    full = librosa.onset.onset_strength(S=mel_db, sr=sr, hop_length=hop)
    return _Envelopes(low=_norm(low), full=_norm(full), mel_db=mel_db, fps=sr / hop)


class _Tempogram:
    """Betragsspektrum der Onset-Huellkurve auf log-Frequenzraster, Spitzen leicht verbreitert."""

    STEP = 1.0005  # Rasterabstand (0.05 %)
    WIDTH = 0.0025  # +-0.25 % Toleranz fuer Harmonische

    def __init__(self, env: np.ndarray, fps: float):
        e = env - env.mean()
        n_fft = int(2 ** np.ceil(np.log2(max(len(e) * 16, 1 << 16))))
        spec = np.abs(np.fft.rfft(e * np.hanning(len(e)), n=n_fft)) / max(1, len(e))
        hz = np.fft.rfftfreq(n_fft, d=1.0 / fps)
        lo_hz, hi_hz = 10.0 / 60.0, min(fps / 2, 900.0 / 60.0)
        self.log_hz = np.log(lo_hz) + np.arange(int(np.log(hi_hz / lo_hz) / np.log(self.STEP))) * np.log(self.STEP)
        cells = np.clip(np.searchsorted(np.log(np.maximum(hz, 1e-9)), self.log_hz), 1, len(hz) - 1)
        # Maximum ueber alle FFT-Bins einer Rasterzelle, dann Toleranzfenster.
        bounds = np.append(cells, len(hz) - 1)
        cell_max = np.maximum.reduceat(spec, bounds[:-1])[: len(cells)]
        width = max(1, int(round(np.log(1 + self.WIDTH) / np.log(self.STEP))))
        self.amp = maximum_filter1d(cell_max, size=2 * width + 1, mode="nearest")

    def at(self, hz) -> np.ndarray:
        return np.interp(np.log(np.asarray(hz, dtype=float)), self.log_hz, self.amp, left=0.0, right=0.0)

    def metrical(self, bpm) -> np.ndarray:
        f = np.asarray(bpm, dtype=float) / 60.0
        return sum(w * self.at(f * k) for k, w in METRICAL_WEIGHTS)


def _dtft_power(env: np.ndarray, fps: float, bpm: np.ndarray) -> np.ndarray:
    """Summe |F(k*f)|^2 fuer Beat und Achtel; exakte Auswertung fuer die Feinabstimmung."""
    e = (env - env.mean()).astype(np.float64)
    t = np.arange(len(e)) / fps
    out = np.zeros(len(bpm))
    for k, w in ((1.0, 1.0), (2.0, 0.5), (4.0, 0.25)):
        for i, b in enumerate(bpm):
            out[i] += w * abs(np.dot(e, np.exp(-2j * np.pi * (b / 60.0) * k * t))) ** 2
    return out


def _refine_bpm(env: np.ndarray, fps: float, bpm: float) -> float:
    duration = len(env) / fps
    # Aufloesung ~ ein Zehntel einer Beatdrift ueber die ganze Laenge.
    span = max(0.004 * bpm, 60.0 / duration)
    for width, n in ((span, 41), (span / 10, 41)):
        grid = np.linspace(bpm - width, bpm + width, n)
        bpm = float(grid[int(np.argmax(_dtft_power(env, fps, grid)))])
    candidates = [round(bpm), round(bpm * 2) / 2]
    scores = _dtft_power(env, fps, np.array([bpm, *candidates], dtype=float))
    # Produzierte Tracks haben fast immer ganzzahlige (oder halbe) BPM.
    for c, s in zip(candidates, scores[1:]):
        if abs(c - bpm) < 0.15 and s >= 0.97 * scores[0]:
            return float(c)
    return bpm


def _pick_tempo(tg: _Tempogram, opts: TempoOptions) -> tuple[float, list[dict]]:
    lo, hi = opts.search_range()
    bpm = np.exp(np.arange(np.log(lo), np.log(hi), np.log(1.0005)))
    salience = tg.metrical(bpm)
    score = salience * opts.prior(bpm)
    best = float(bpm[int(np.argmax(score))])
    best_score = float(score.max()) + 1e-12
    cands = [{"bpm": round(best, 2), "relation": "1", "score": 1.0}]
    for name, factor in RELATED.items():
        b = best * factor
        if lo * 0.5 <= b <= hi * 2:
            s = float(tg.metrical(b) * opts.prior(b)) / best_score
            cands.append({"bpm": round(b, 2), "relation": name, "score": round(min(s, 1.0), 3)})
    return best, cands


def _beat_phase(env: np.ndarray, fps: float, bpm: float) -> float:
    """Zeit (s) des ersten Beats im Bereich [0, Periode)."""
    period = 60.0 / bpm
    t = np.arange(len(env)) / fps
    F = np.dot(env - env.mean(), np.exp(-2j * np.pi * t / period))
    return float((-np.angle(F) / (2 * np.pi) * period) % period)


def _strength_at(env: np.ndarray, fps: float, times: np.ndarray) -> np.ndarray:
    fr = np.clip(np.round(times * fps).astype(int), 0, len(env) - 1)
    # +-1 Frame Toleranz, die Huellkurve ist nicht exakt auf den Anschlag zentriert.
    return np.max(np.stack([env[np.clip(fr + d, 0, len(env) - 1)] for d in (-1, 0, 1)]), axis=0)


def _grid_fit(env: np.ndarray, fps: float, phase: float, period: float) -> float:
    """Anteil der starken Onsets, die auf ein Achtel-Raster fallen."""
    peaks = librosa.util.peak_pick(env, pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=0.05, wait=3)
    if len(peaks) < 8:
        return 0.0
    strong = peaks[env[peaks] >= np.percentile(env[peaks], 50)]
    t = strong / fps
    off = np.mod(t - phase + period / 4, period / 2) - period / 4
    return float(np.mean(np.abs(off) < 0.1 * period + 0.5 / fps))


def _downbeat_index(envs: _Envelopes, beat_times: np.ndarray, beats_per_bar: int) -> tuple[int, float]:
    """Welche der `beats_per_bar` Beat-Positionen ist die Eins? -> (Index, Konfidenz 0..1)."""
    fps = envs.fps
    frames = np.clip(np.round(beat_times * fps).astype(int), 0, envs.mel_db.shape[1] - 1)
    if len(frames) < beats_per_bar * 4:
        return 0, 0.0
    # Beat-synchrone Klangfarbe, verglichen mit demselben Beat einen Takt vorher: ein sich
    # wiederholendes Pattern ergibt ~0, neue Elemente/Basswechsel/Crashes setzen auf der Eins ein.
    # Gezaehlt wird nur der Anstieg dieser Differenz (Beginn der Aenderung).
    edges = np.append(frames, envs.mel_db.shape[1])
    sync = np.stack([envs.mel_db[:, a:max(b, a + 1)].mean(axis=1) for a, b in zip(edges[:-1], edges[1:])], axis=1)
    lag = beats_per_bar
    # Vor dem Track liegt "Stille", damit auch der Einsatz im ersten Takt als Aenderung zaehlt.
    silence = np.repeat(sync.min(axis=1, keepdims=True), lag, axis=1)
    padded = np.concatenate([silence, sync], axis=1)
    d_bar = np.sqrt(np.mean((padded[:, lag:] - padded[:, :-lag]) ** 2, axis=0))
    change = np.maximum(0.0, np.diff(d_bar, prepend=0.0))
    accent = _strength_at(envs.low, fps, beat_times) + 0.3 * _strength_at(envs.full, fps, beat_times)
    scores = []
    for p in range(beats_per_bar):
        c = change[p::beats_per_bar].mean() / (change.mean() + 1e-9)
        a = accent[p::beats_per_bar].mean() / (accent.mean() + 1e-9)
        scores.append(c + a)
    scores = np.array(scores)
    order = np.argsort(-scores)
    margin = (scores[order[0]] - scores[order[1]]) / (scores[order[0]] + 1e-9)
    return int(order[0]), float(np.clip(margin * 10, 0.0, 1.0))


def estimate_grid(y: np.ndarray, sr: int = ANALYSIS_SR, hop: int = HOP, beats_per_bar: int = 4,
                  options: TempoOptions | None = None) -> BeatGrid:
    opts = options or TempoOptions()
    duration = len(y) / sr
    envs = _envelopes(y, sr, hop)
    env = envs.combined
    if len(env) < 4 * envs.fps or env.max() <= 0:
        bpm = float(opts.bpm_hint or PRIOR_CENTER_BPM)
        return BeatGrid(bpm=bpm, first_downbeat_sec=0.0, duration_sec=duration, confidence=0.0,
                        beats_per_bar=beats_per_bar, source=opts.source)

    tg = _Tempogram(env, envs.fps)
    coarse, candidates = _pick_tempo(tg, opts)
    bpm = _refine_bpm(env, envs.fps, coarse)
    if opts.bpm_hint and abs(bpm - opts.bpm_hint) < 0.3:
        bpm = float(opts.bpm_hint)
    candidates[0]["bpm"] = round(bpm, 2)
    period = 60.0 / bpm

    phase = _beat_phase(env, envs.fps, bpm)
    # Phase ist bei Offbeat-Hats doppeldeutig: die Variante mit den staerkeren (tiefen) Onsets ist der Beat.
    def strength(ph: float) -> float:
        return float(_strength_at(env, envs.fps, np.arange(ph, duration, period)).mean())

    if strength((phase + period / 2) % period) > strength(phase):
        phase = (phase + period / 2) % period
    confidence = _grid_fit(env, envs.fps, phase, period)

    beat_times = np.arange(phase, duration, period)
    db_idx, db_conf = _downbeat_index(envs, beat_times, beats_per_bar)
    downbeat = float(beat_times[db_idx]) if len(beat_times) > db_idx else phase
    bar = beats_per_bar * period
    while downbeat - bar >= -0.02:
        downbeat -= bar
    downbeat = max(0.0, downbeat)

    return BeatGrid(bpm=bpm, first_downbeat_sec=downbeat, duration_sec=duration, confidence=confidence,
                    beats_per_bar=beats_per_bar, downbeat_confidence=db_conf, candidates=candidates,
                    source=opts.source)
