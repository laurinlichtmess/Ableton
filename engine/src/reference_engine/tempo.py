"""Tempo, Beatgrid und Taktanfang (4/4) bestimmen.

Live arbeitet mit konstantem Tempo, daher wird aus den erkannten Beats ein
konstantes Raster (BPM + Phase) gefittet. Beat 0 im Ergebnis entspricht dem
ersten erkannten Taktanfang; das ist die Arrangement-Position 1.1.1 in Live.
"""

from __future__ import annotations

from dataclasses import dataclass

import librosa
import numpy as np

from .audio import ANALYSIS_SR, HOP

MIN_BPM = 70.0
MAX_BPM = 180.0


@dataclass
class BeatGrid:
    bpm: float
    first_downbeat_sec: float
    duration_sec: float
    confidence: float
    beats_per_bar: int = 4

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
        return max(1, int(np.floor(bars + 0.5)))

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
        }


def _fold_bpm(bpm: float) -> float:
    while bpm < MIN_BPM:
        bpm *= 2.0
    while bpm > MAX_BPM:
        bpm /= 2.0
    return bpm


def _coherence(times: np.ndarray, period: float) -> complex:
    # Doppelte Frequenz: ein Tracker, der zeitweise auf die Offbeats springt, stoert die Periode nicht.
    return complex(np.mean(np.exp(4j * np.pi * times / period)))


def _fit_grid(beat_times: np.ndarray, bpm_guess: float) -> tuple[float, float]:
    """Konstantes Raster (BPM, Phase modulo halber Beat) mit maximaler Phasenkohaerenz der Beats."""
    candidates = np.arange(bpm_guess * 0.96, bpm_guess * 1.04, 0.01)
    candidates = np.unique(np.concatenate([candidates, np.round(candidates)]))
    scores = np.array([abs(_coherence(beat_times, 60.0 / b)) for b in candidates])
    best = float(candidates[int(np.argmax(scores))])
    near_int = [b for b, s in zip(candidates, scores) if b == round(b) and s >= 0.98 * scores.max()]
    if near_int:
        best = float(min(near_int, key=lambda b: abs(b - best)))
    period = 60.0 / best
    phase = (np.angle(_coherence(beat_times, period)) / (4 * np.pi)) * period
    return best, float(phase % (period / 2))


def _low_onset_envelope(y: np.ndarray, sr: int, hop: int) -> np.ndarray:
    mel = librosa.feature.melspectrogram(y=y, sr=sr, hop_length=hop, n_mels=64, fmax=sr / 2)
    freqs = librosa.mel_frequencies(n_mels=64, fmax=sr / 2)
    low = librosa.power_to_db(mel[freqs < 150.0])
    return librosa.onset.onset_strength(S=low, sr=sr, hop_length=hop)


def estimate_grid(y: np.ndarray, sr: int = ANALYSIS_SR, hop: int = HOP, beats_per_bar: int = 4) -> BeatGrid:
    duration = len(y) / sr
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop, units="frames")
    tempo = float(np.atleast_1d(tempo)[0]) if np.size(tempo) else 120.0
    if tempo <= 0:
        tempo = 120.0
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)

    if len(beat_times) < 8:
        bpm = _fold_bpm(tempo)
        period = 60.0 / bpm
        phase = float(beat_times[0]) if len(beat_times) else 0.0
        confidence = 0.0
    else:
        bpm, phase = _fit_grid(beat_times, _fold_bpm(tempo))
        period = 60.0 / bpm
        # Phase ist nur modulo halbem Beat bestimmt: die Variante mit staerkeren (v. a. tiefen) Onsets
        # ist der Beat - Hi-Hats liegen oft auf den Offbeats, die Kick auf den Beats.
        low_env = _low_onset_envelope(y, sr, hop)
        env_n = 0.7 * low_env / (low_env.max() + 1e-9) + 0.3 * onset_env / (onset_env.max() + 1e-9)

        def strength(ph: float) -> float:
            t = np.arange(ph, duration, period)
            fr = np.clip(librosa.time_to_frames(t, sr=sr, hop_length=hop), 0, len(env_n) - 1)
            return float(env_n[fr].mean())

        if strength(phase + period / 2) > strength(phase):
            phase += period / 2
        half_offsets = np.mod(beat_times - phase + period / 4, period / 2) - period / 4
        confidence = float(np.mean(np.abs(half_offsets) < 0.1 * period))

    grid_beats = np.arange(np.ceil(-phase / period), np.floor((duration - phase) / period) + 1)
    grid_times = phase + grid_beats * period
    grid_times = grid_times[(grid_times >= 0) & (grid_times < duration)]

    downbeat = float(grid_times[0]) if len(grid_times) else 0.0
    if len(grid_times) >= beats_per_bar * 2:
        low_env = _low_onset_envelope(y, sr, hop)
        full_env = onset_env / (onset_env.max() + 1e-9)
        low_env = low_env / (low_env.max() + 1e-9)
        frames = np.clip(librosa.time_to_frames(grid_times, sr=sr, hop_length=hop), 0, len(low_env) - 1)
        strength = 0.7 * low_env[frames] + 0.3 * full_env[frames]
        scores = [strength[p::beats_per_bar].mean() for p in range(beats_per_bar)]
        downbeat = float(grid_times[int(np.argmax(scores))])

    bar = beats_per_bar * period
    while downbeat - bar >= -0.02:
        downbeat -= bar
    downbeat = max(0.0, downbeat)

    return BeatGrid(bpm=bpm, first_downbeat_sec=downbeat, duration_sec=duration,
                    confidence=confidence, beats_per_bar=beats_per_bar)
