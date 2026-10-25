"""Synthetische Testsongs mit bekannten Abschnitten, Sweeps und Fades."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

SR = 22050


@dataclass
class SongSpec:
    bpm: float = 128.0
    preroll_sec: float = 0.25
    # (Name, Takte, Elemente)
    sections: list[tuple[str, int, set[str]]] = field(default_factory=lambda: [
        ("intro", 8, {"pad", "hats"}),
        ("build", 8, {"pad", "hats", "sweep"}),
        ("drop", 8, {"kick", "bass", "lead", "hats", "pad"}),
        ("breakdown", 8, {"pad"}),
        ("drop", 8, {"kick", "bass", "lead", "hats", "pad"}),
        ("outro", 8, {"kick", "bass", "hats", "fade"}),
    ])

    @property
    def beat_sec(self) -> float:
        return 60.0 / self.bpm

    @property
    def boundaries(self) -> list[int]:
        out, acc = [0], 0
        for _, bars, _ in self.sections:
            acc += bars
            out.append(acc)
        return out


def _env(n: int, decay: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (decay * SR))


def _kick(n: int) -> np.ndarray:
    t = np.arange(n) / SR
    freq = 45 + 75 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * _env(n, 0.12)


def _hat(rng: np.random.Generator, n: int) -> np.ndarray:
    noise = rng.standard_normal(n)
    noise = np.diff(noise, prepend=0.0)
    return noise * _env(n, 0.012) * 0.25


def _saw(freq: float, n: int) -> np.ndarray:
    t = np.arange(n) / SR
    return 2.0 * (t * freq - np.floor(0.5 + t * freq))


def _lowpass_sweep(x: np.ndarray, cutoff_hz: np.ndarray) -> np.ndarray:
    """STFT-Maske mit 24 dB/Okt. Flanke; cutoff_hz pro Sample."""
    hop = 256
    S = librosa.stft(x, n_fft=2048, hop_length=hop)
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)[:, None]
    fc = cutoff_hz[np.clip(np.arange(S.shape[1]) * hop, 0, len(x) - 1)][None, :]
    mask = 1.0 / np.sqrt(1.0 + (freqs / fc) ** 8)
    return librosa.istft(S * mask, hop_length=hop, length=len(x))


def render(spec: SongSpec, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    beat = int(round(spec.beat_sec * SR))
    total_bars = spec.boundaries[-1]
    n = int(spec.preroll_sec * SR) + total_bars * 4 * beat + SR
    out = np.zeros(n)
    start = int(spec.preroll_sec * SR)
    pos = start
    for _, bars, elems in spec.sections:
        length = bars * 4 * beat
        seg = np.zeros(length)
        for b in range(bars * 4):
            o = b * beat
            accent = 1.0 if b % 4 == 0 else 0.75
            if "kick" in elems:
                seg[o:o + beat] += 0.9 * accent * _kick(beat)
            if "hats" in elems:
                h = o + beat // 2
                seg[h:h + beat // 4] += _hat(rng, min(beat // 4, length - h))
        if "pad" in elems:
            pad = sum(np.sin(2 * np.pi * f * np.arange(length) / SR) for f in (220.0, 261.63, 329.63))
            seg += 0.05 * pad
        phase = (np.arange(length) % beat) / beat
        pump = 0.15 + 0.85 * np.minimum(1.0, phase / 0.45)
        if "bass" in elems:
            note = np.where((np.arange(length) // (4 * beat)) % 2 == 0, 55.0, 49.0)
            bass = np.sin(2 * np.pi * np.cumsum(note) / SR)
            seg += 0.35 * bass * pump
        if "lead" in elems or "sweep" in elems:
            lead = sum(_saw(f, length) for f in (220.0, 277.18, 329.63)) * 0.08
            if "sweep" in elems:
                cutoff = 150.0 * (12000.0 / 150.0) ** (np.arange(length) / length)
                lead = _lowpass_sweep(lead, cutoff) * 1.6
            else:
                lead = lead * pump
            seg += lead
        if "fade" in elems:
            seg *= 10 ** (np.linspace(0, -30, length) / 20)
        out[pos:pos + length] += seg
        pos += length
    out /= np.max(np.abs(out)) + 1e-9
    return (0.9 * out).astype(np.float32)


def write_song(path: Path, spec: SongSpec | None = None, fmt: str | None = None) -> SongSpec:
    spec = spec or SongSpec()
    y = render(spec)
    if fmt == "MP3":
        sf.write(str(path), y, SR, format="MP3")
    else:
        sf.write(str(path), y, SR)
    return spec
