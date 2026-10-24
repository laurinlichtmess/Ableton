"""Feinere Elemente aus den Stems: Kick, Bass, Clap/Snare, Hats, Ride, Percussion, Atmo, Synth, Vocals.

Ohne zusaetzliches ML-Modell, nur Spektrogramm-Masken auf den (Demucs-)Stems:

* Kick vs. Bass (gleiches Tiefband): Kick-Anschlaege werden ueber den Tonhoehen-Abfall im Tiefband
  erkannt; der Bass wird ausserhalb dieser Kick-Fenster gemessen (entfernt auch Kick-Uebersprechen
  im Demucs-Bass-Stem).
* Ride vs. Hats: im Hochband bleibt nach einer morphologischen Oeffnung ueber ~200 ms nur der
  ausklingende Ride-Teppich; Hats sind der kurze Transienten-Rest darueber.
* Clap/Snare vs. Percussion: perkussiver Anteil (HPSS) im Rausch-Band 0.9-5 kHz bzw. im tonalen
  Band 150-800 Hz.
* Atmo vs. Synth: im "other"-Stem ist der ueber ~1.5 s gehaltene Anteil Flaeche (Pads/Atmo), der
  Rest (Stabs, Arps, Leads) Synth.

Ohne Demucs ("bands") wird dasselbe auf dem Mix gemacht; das ist deutlich ungenauer (keine Vocals,
Pads koennen in Ride/Synth uebersprechen).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterator

import librosa
import numpy as np
from scipy.ndimage import grey_opening, maximum_filter1d

from .audio import ANALYSIS_SR, HOP
from .tempo import BeatGrid

N_FFT = 2048
ELEMENTS = ("kick", "bass", "clap", "hats", "ride", "perc", "atmo", "synth", "vocals")
DISPLAY_NAMES = {"kick": "Kick", "bass": "Bass", "clap": "Clap/Snare", "hats": "Hats", "ride": "Ride",
                 "perc": "Percussion", "atmo": "Atmo/Pads", "synth": "Synth/Lead", "vocals": "Vocals"}
PARENT_STEM = {"kick": "drums", "clap": "drums", "hats": "drums", "ride": "drums", "perc": "drums",
               "bass": "bass", "atmo": "other", "synth": "other", "vocals": "vocals"}
# Takt gilt als "Element vorhanden", wenn sein Pegel hoechstens so weit unter dem lauten Pegel
# (90. Perzentil der Takte) des Elements liegt.
PRESENT_REL_DB = {"kick": 15.0, "bass": 15.0, "clap": 15.0, "hats": 15.0, "ride": 12.0, "perc": 15.0,
                  "atmo": 15.0, "synth": 15.0, "vocals": 18.0}
# Ohne Trennung (Mix) ist das Uebersprechen groesser: strengere Schwelle fuer Flaechen/Synths.
PRESENT_REL_DB_MIX = {"atmo": 12.0, "synth": 12.0}
# Element gilt als im Track vorhanden, wenn es nicht weiter als das unter dem Mix liegt.
ABSENT_BELOW_MIX_DB = 35.0

ProgressFn = Callable[[float, str], None]


@dataclass
class ElementSignal:
    name: str
    mag: np.ndarray  # (bins, frames) Betragsspektrum bei N_FFT/HOP
    source: str  # Stem, aus dem das Element stammt


def _soft_band(freqs: np.ndarray, lo: float | None, hi: float | None, width_oct: float = 0.1) -> np.ndarray:
    lf = np.log2(np.maximum(freqs, 1.0))
    w = np.ones_like(freqs, dtype=np.float32)
    if lo:
        w *= 1.0 / (1.0 + np.exp(-(lf - np.log2(lo)) / width_oct))
    if hi:
        w *= 1.0 / (1.0 + np.exp((lf - np.log2(hi)) / width_oct))
    return w.astype(np.float32)[:, None]


def _mag(y: np.ndarray, hop: int) -> np.ndarray:
    return np.abs(librosa.stft(y.astype(np.float32), n_fft=N_FFT, hop_length=hop)).astype(np.float32)


def kick_onsets(low_mag: np.ndarray, freqs: np.ndarray, grid: BeatGrid | None, sr: int, hop: int,
                require_pitch_drop: bool) -> np.ndarray:
    """Frames der Kick-Anschlaege im Tiefband.

    `require_pitch_drop`: nur Anschlaege mit fallender Tonhoehe (typischer Kick-"Pitch-Sweep");
    noetig, wenn Kick und Bass im selben Signal liegen (Mix ohne Demucs).
    """
    band = (freqs >= 25) & (freqs <= 300)
    S = low_mag[band]
    if S.shape[1] < 8 or S.max() <= 0:
        return np.zeros(0, dtype=int)
    S_db = librosa.amplitude_to_db(S, ref=np.max)
    env = librosa.onset.onset_strength(S=S_db[: int(np.sum(freqs[band] <= 150))], sr=sr, hop_length=hop)
    if env.max() <= 0:
        return np.zeros(0, dtype=int)
    env = env / env.max()
    peaks = librosa.util.peak_pick(env, pre_max=2, post_max=2, pre_avg=8, post_avg=8, delta=0.1, wait=3)
    if not require_pitch_drop or not len(peaks):
        return peaks.astype(int)
    f = freqs[band][:, None]
    power = S ** 2
    cent = (f * power).sum(axis=0) / (power.sum(axis=0) + 1e-12)
    n = S.shape[1]
    keep = []
    for p in peaks:
        early = cent[p:min(n, p + 2)].max()
        late = cent[min(n - 1, p + 3)]
        if early - late >= 15.0:
            keep.append(p)
    peaks = np.array(keep, dtype=int)
    if grid is not None and len(peaks):
        # Ohne Trennung zusaetzlich: Kicks liegen auf Viertel- oder Achtelpositionen.
        t = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
        pos = grid.sec_to_beat(t) * 2
        off = np.abs(pos - np.round(pos)) * grid.beat_sec / 2
        peaks = peaks[off < 2.5 * hop / sr]
    return peaks


def _event_mask(onsets: np.ndarray, n_frames: int, length: int, lead: int = 2) -> np.ndarray:
    m = np.zeros(n_frames, dtype=np.float32)
    for o in onsets:
        # Vorlauf: das zentrierte STFT-Fenster (~93 ms) sieht den Anschlag schon frueher.
        a, b = max(0, o - lead), min(n_frames, o + length + 1)
        m[a:b] = 1.0
    return m


def _opening(S: np.ndarray, frames: int) -> np.ndarray:
    """Gehaltener Anteil: Spitzen kuerzer als `frames` werden entfernt (pro Frequenz)."""
    if frames <= 1 or S.shape[1] < frames:
        return S.copy()
    return grey_opening(S, size=(1, frames)).astype(np.float32)


def element_signals(stems: dict[str, np.ndarray], mix: np.ndarray, method: str, grid: BeatGrid,
                    sr: int = ANALYSIS_SR, hop: int = HOP,
                    progress: ProgressFn | None = None) -> Iterator[ElementSignal]:
    """Erzeugt die Element-Spektrogramme nacheinander (spart Speicher bei langen Tracks)."""
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    beat_frames = max(1, int(round(grid.beat_sec * sr / hop)))

    def step(i: int, msg: str) -> None:
        if progress:
            progress(i / 6.0, msg)

    step(0, "Elemente: Kick/Bass")
    separated = method != "bands" and "drums" in stems
    drums_src = stems["drums"] if separated else mix
    D = _mag(drums_src, hop)
    n = D.shape[1]
    low = D * _soft_band(freqs, None, 150.0)
    onsets = kick_onsets(low, freqs, None if separated else grid, sr, hop, require_pitch_drop=not separated)
    # Ohne Trennung liegt das Kick-Ausklingen im selben Signal wie der Bass: laengeres Fenster.
    kick_win = _event_mask(onsets, n, max(2, int((0.35 if separated else 0.75) * beat_frames)))
    if separated:
        yield ElementSignal("kick", low, "drums")
    else:
        yield ElementSignal("kick", low * kick_win[None, :], "mix")
    del low

    if separated and "bass" in stems:
        B = _mag(stems["bass"], hop)[:, :n]
        bass_src = "bass"
    else:
        # Nur gehaltene Bass-Grundtoene (bis ~H2): Pads darueber und Anschlaege von Percussion
        # (breitbandig, aber kurz) sollen nicht als Bass zaehlen.
        low_bins = freqs < 200.0
        H_low, _ = librosa.decompose.hpss(D[low_bins], kernel_size=(17, 31), margin=(2.0, 1.0))
        B = np.zeros_like(D)
        B[low_bins] = H_low * _soft_band(freqs[low_bins], None, 120.0, width_oct=0.05)
        bass_src = "mix"
    gate = 1.0 - kick_win[None, : B.shape[1]]
    yield ElementSignal("bass", B * gate, bass_src)
    del B, gate

    step(1, "Elemente: Drums (HPSS)")
    _, P = librosa.decompose.hpss(D, kernel_size=(17, 31), margin=(1.0, 1.5))
    P = P.astype(np.float32)
    drum_src = "drums" if separated else "mix"
    # Kick-Obertoene/Klick am Anschlag nicht als Percussion zaehlen.
    kick_short = 1.0 - 0.9 * _event_mask(onsets, n, 1, lead=1)[None, :]
    yield ElementSignal("clap", P * _soft_band(freqs, 900.0, 5000.0), drum_src)
    yield ElementSignal("perc", P * _soft_band(freqs, 150.0, 800.0) * kick_short, drum_src)
    del P

    step(2, "Elemente: Hats/Ride")
    high = D * _soft_band(freqs, 2500.0, 11000.0)
    sustained = _opening(high, max(3, int(round(0.2 * sr / hop))))
    yield ElementSignal("ride", sustained, drum_src)
    transient = np.maximum(high - sustained, 0.0) * _soft_band(freqs, 5500.0, None)
    yield ElementSignal("hats", transient, drum_src)
    del high, sustained, transient, D

    step(4, "Elemente: Atmo/Synth")
    if separated and "other" in stems:
        O = _mag(stems["other"], hop)[:, :n]
        other_src = "other"
    else:
        # Strenge Trennung und ohne Tiefmitten: tonale Percussion/Bass sollen nicht als Synth zaehlen.
        H, _ = librosa.decompose.hpss(_mag(mix, hop), kernel_size=(17, 31), margin=(3.0, 1.0))
        O = H.astype(np.float32) * _soft_band(freqs, 400.0, 2500.0)
        other_src = "mix"
    held = _opening(O, max(3, int(round(1.5 * sr / hop))))
    yield ElementSignal("atmo", held, other_src)
    yield ElementSignal("synth", np.maximum(O - held, 0.0), other_src)
    del O, held

    if separated and "vocals" in stems:
        step(5, "Elemente: Vocals")
        yield ElementSignal("vocals", _mag(stems["vocals"], hop), "vocals")


def bar_levels_db(beat_rms_db: np.ndarray, beats_per_bar: int, num_bars: int) -> np.ndarray:
    """Pegel pro Takt (dB): zweitlautester Beat. Ein Ausklingen in den ersten Beat des naechsten
    Takts zaehlt so nicht, ein Clap auf 2 und 4 aber schon."""
    out = np.full(num_bars, -100.0)
    for b in range(num_bars):
        seg = np.sort(beat_rms_db[b * beats_per_bar:(b + 1) * beats_per_bar])
        if seg.size:
            out[b] = float(seg[-2] if seg.size >= 2 else seg[-1])
    return out


def presence_from_levels(bar_db: np.ndarray, name: str, separated: bool = True) -> tuple[np.ndarray, float]:
    """-> (vorhanden pro Takt, lauter Pegel). Kurze Luecken (1 Takt) werden geschlossen."""
    if bar_db.size == 0:
        return np.zeros(0, dtype=bool), -100.0
    loud = float(np.percentile(bar_db, 90))
    rel = PRESENT_REL_DB.get(name, 15.0) if separated else PRESENT_REL_DB_MIX.get(name, PRESENT_REL_DB.get(name, 15.0))
    present = bar_db > loud - rel
    if present.size >= 3:
        closed = present.copy()
        closed[1:-1] |= present[:-2] & present[2:]
        present = closed
    return present, loud


def smooth_presence(present: np.ndarray, min_run: int = 2) -> np.ndarray:
    """Einzelne Ausreisser-Takte (kuerzer als `min_run`) entfernen."""
    out = present.copy()
    n = len(out)
    i = 0
    while i < n:
        j = i
        while j < n and out[j] == out[i]:
            j += 1
        if out[i] and j - i < min_run and 0 < i and j < n:
            out[i:j] = False
        i = j
    return out


def presence_profile(present_bars: np.ndarray, bar_db: np.ndarray) -> list[float]:
    """Staerke 0..1 pro Takt (relativ zum lauten Pegel), 0 wo nicht vorhanden."""
    if bar_db.size == 0:
        return []
    loud = float(np.percentile(bar_db, 90))
    rel = np.clip(1.0 + (bar_db - loud) / 24.0, 0.0, 1.0)
    return [round(float(v), 2) if p else 0.0 for v, p in zip(rel, present_bars)]


def active_spans(present_bars: np.ndarray) -> list[list[int]]:
    """Zusammenhaengende Takt-Bereiche [start, end) mit Element."""
    spans: list[list[int]] = []
    start = None
    for i, p in enumerate(list(present_bars) + [False]):
        if p and start is None:
            start = i
        elif not p and start is not None:
            spans.append([start, i])
            start = None
    return spans


def maximum_over(x: np.ndarray, frames: int) -> np.ndarray:
    return maximum_filter1d(x, size=max(1, frames), mode="nearest")
