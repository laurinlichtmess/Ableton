"""Realistischere Techno/Hardgroove-Testsignale: einzelne Elemente pro Takt, getrennt gerendert.

Jedes Element wird als eigene Spur erzeugt, damit Tests sowohl den Mix (Band-Fallback) als auch
"perfekte" Demucs-Stems (Summe der Drum-Elemente usw.) pruefen koennen.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.signal import butter, sosfilt

SR = 22050
DRUM_ELEMENTS = ("kick", "clap", "hats", "ride", "perc")
STEM_OF = {"kick": "drums", "clap": "drums", "hats": "drums", "ride": "drums", "perc": "drums",
           "bass": "bass", "atmo": "other", "synth": "other"}


@dataclass
class GrooveSpec:
    bpm: float = 147.0
    preroll_sec: float = 0.3
    # (Name, Takte, Elemente)
    sections: list[tuple[str, int, set[str]]] = field(default_factory=lambda: [
        ("intro", 16, {"kick", "hats", "perc"}),
        ("main", 32, {"kick", "hats", "perc", "bass", "clap", "ride"}),
        ("breakdown", 16, {"atmo", "synth", "perc"}),
        ("main", 32, {"kick", "hats", "perc", "bass", "clap", "ride", "synth"}),
        ("outro", 16, {"kick", "hats", "perc"}),
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

    def bar_elements(self) -> list[set[str]]:
        out: list[set[str]] = []
        for _, bars, elems in self.sections:
            out += [elems] * bars
        return out


def _env(n: int, decay: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (decay * SR))


def _band(x: np.ndarray, lo: float | None, hi: float | None, order: int = 4) -> np.ndarray:
    if lo and hi:
        sos = butter(order, [lo, hi], btype="bandpass", fs=SR, output="sos")
    elif lo:
        sos = butter(order, lo, btype="highpass", fs=SR, output="sos")
    else:
        sos = butter(order, hi, btype="lowpass", fs=SR, output="sos")
    return sosfilt(sos, x)


def kick(n: int) -> np.ndarray:
    t = np.arange(n) / SR
    freq = 50 + 110 * np.exp(-t / 0.025)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * _env(n, 0.09)
    click = np.zeros(n)
    click[:60] = np.hanning(120)[60:] * 0.3
    return body + click


def clap(rng: np.random.Generator, n: int) -> np.ndarray:
    noise = _band(rng.standard_normal(n), 900, 4000, order=2)
    env = _env(n, 0.06)
    for k in range(3):  # Mehrfachschlag typisch fuer Claps
        o = int(k * 0.011 * SR)
        env[o:o + int(0.004 * SR)] += 0.8
    return 0.5 * noise * env


def hat(rng: np.random.Generator, n: int) -> np.ndarray:
    return 0.35 * _band(rng.standard_normal(n), 7000, None) * _env(n, 0.018)


def ride(rng: np.random.Generator, n: int) -> np.ndarray:
    t = np.arange(n) / SR
    partials = sum(np.sin(2 * np.pi * f * t + p) for f, p in ((3150, 0.1), (4420, 1.3), (5890, 2.0), (7310, 0.7)))
    shimmer = _band(rng.standard_normal(n), 4000, 10000, order=2)
    return (0.05 * partials + 0.08 * shimmer) * _env(n, 0.45)


def perc(n: int, f0: float = 330.0) -> np.ndarray:
    t = np.arange(n) / SR
    freq = f0 * (1 + 0.15 * np.exp(-t / 0.01))
    return 0.45 * np.sin(2 * np.pi * np.cumsum(freq) / SR) * _env(n, 0.05)


def _saw(freq: float, n: int, phase: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR + phase
    return 2.0 * (t * freq - np.floor(0.5 + t * freq))


def render_elements(spec: GrooveSpec, seed: int = 3) -> dict[str, np.ndarray]:
    """Gibt ein Signal pro Element zurueck (gleiche Laenge)."""
    rng = np.random.default_rng(seed)
    beat = spec.beat_sec
    total_bars = spec.boundaries[-1]
    n = int((spec.preroll_sec + total_bars * 4 * beat + 1.0) * SR)
    names = ("kick", "clap", "hats", "ride", "perc", "bass", "atmo", "synth")
    out = {k: np.zeros(n) for k in names}
    pre = spec.preroll_sec

    def put(name: str, t_sec: float, x: np.ndarray) -> None:
        o = int(round(t_sec * SR))
        m = min(len(x), n - o)
        if m > 0:
            out[name][o:o + m] += x[:m]

    k_len, h_len = int(0.3 * SR), int(0.12 * SR)
    for bar, elems in enumerate(spec.bar_elements()):
        t0 = pre + bar * 4 * beat
        for b in range(4):
            tb = t0 + b * beat
            if "kick" in elems:
                put("kick", tb, 0.9 * kick(k_len))
            if "clap" in elems and b in (1, 3):
                put("clap", tb, clap(rng, int(0.25 * SR)))
            if "hats" in elems:
                put("hats", tb + beat / 2, hat(rng, h_len))
                put("hats", tb + beat / 4, 0.4 * hat(rng, h_len))
                put("hats", tb + 3 * beat / 4, 0.4 * hat(rng, h_len))
            if "ride" in elems:
                for half in (0, 1):
                    put("ride", tb + half * beat / 2, ride(rng, int(0.9 * SR)))
        if "perc" in elems:
            # 3-Sechzehntel-Muster (punktierte Achtel): klassischer Ausloeser fuer 2/3-Tempo-Fehler.
            for s in range(0, 16, 3):
                put("perc", t0 + s * beat / 4, perc(int(0.2 * SR), 330.0 if s % 6 == 0 else 250.0))
        seg_n = int(4 * beat * SR)
        if "bass" in elems:
            t = np.arange(seg_n) / SR
            note = 55.0 if bar % 2 == 0 else 49.0
            phase = (t % beat) / beat
            # Rollender Offbeat-Bass: Pause auf der Kick, Toene auf den Sechzehnteln 2-4.
            gate = np.where(phase < 0.25, 0.0, 1.0) * np.exp(-((phase * 4) % 1.0) * 2.0)
            put("bass", t0, 0.45 * np.sin(2 * np.pi * note * t) * gate)
        if "atmo" in elems:
            t = np.arange(seg_n) / SR + bar * 4 * beat
            pad = sum(_saw(f, seg_n, bar * 4 * beat) for f in (220.0, 261.63, 329.63))
            put("atmo", t0, 0.04 * _band(pad, None, 2500, order=2) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.1 * t)))
        if "synth" in elems:
            for s in (0, 3, 6, 10, 12):  # Stabs
                L = int(0.12 * SR)
                put("synth", t0 + s * beat / 4, 0.12 * _saw(440.0, L) * _env(L, 0.05))
    return {k: v.astype(np.float32) for k, v in out.items()}


# Dichte Percussion, verhaltene Kick: so liefert librosa.beat_track bei 147 BPM ~98 BPM (2/3).
HARDGROOVE_GAINS = {"kick": 0.5, "perc": 3.0}


def mix(elements: dict[str, np.ndarray], gains: dict[str, float] | None = None) -> np.ndarray:
    gains = gains or {}
    y = sum(x * gains.get(k, 1.0) for k, x in elements.items())
    return (0.9 * y / (np.max(np.abs(y)) + 1e-9)).astype(np.float32)


def stems_from(elements: dict[str, np.ndarray], gains: dict[str, float] | None = None) -> dict[str, np.ndarray]:
    """Ideale Demucs-Stems, gleich skaliert wie `mix(elements, gains)`."""
    gains = gains or {}
    y = sum(x * gains.get(k, 1.0) for k, x in elements.items())
    scale = 0.9 / (np.max(np.abs(y)) + 1e-9)
    stems: dict[str, np.ndarray] = {}
    for name, x in elements.items():
        s = STEM_OF[name]
        stems[s] = stems.get(s, 0) + x * gains.get(name, 1.0)
    stems["vocals"] = np.zeros_like(y)
    return {k: (v * scale).astype(np.float32) for k, v in stems.items()}
