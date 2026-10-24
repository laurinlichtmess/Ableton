"""Stem-Trennung: Demucs (wenn installiert) oder ein schneller Band-/HPSS-Fallback."""

from __future__ import annotations

import importlib.util
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import librosa
import numpy as np
from scipy.signal import butter, sosfiltfilt

from .audio import ANALYSIS_SR, load_stereo

DEMUCS_STEMS = ("drums", "bass", "other", "vocals")
DEMUCS_MODEL = os.environ.get("REFERENCE_ENGINE_DEMUCS_MODEL", "htdemucs")

ProgressFn = Callable[[float, str], None]


@dataclass
class SeparationResult:
    method: str  # "demucs" | "bands"
    stems: dict[str, np.ndarray]  # mono, ANALYSIS_SR
    sr: int = ANALYSIS_SR


def demucs_available() -> bool:
    return importlib.util.find_spec("demucs") is not None and importlib.util.find_spec("torch") is not None


def cache_dir() -> Path:
    base = os.environ.get("REFERENCE_ENGINE_CACHE")
    if base:
        return Path(base)
    return Path.home() / ".cache" / "reference-rebuilder"


def separate_bands(y: np.ndarray, sr: int = ANALYSIS_SR) -> SeparationResult:
    """Grobe Naeherung ohne ML: Perkussives -> drums, Harmonisches unter 180 Hz -> bass, Rest -> other."""
    harmonic, percussive = librosa.effects.hpss(y, margin=2.0)
    low = butter(4, 180.0, btype="lowpass", fs=sr, output="sos")
    high = butter(4, 180.0, btype="highpass", fs=sr, output="sos")
    bass = sosfiltfilt(low, harmonic).astype(np.float32)
    other = sosfiltfilt(high, harmonic).astype(np.float32)
    return SeparationResult(method="bands", stems={"drums": percussive.astype(np.float32), "bass": bass, "other": other})


def _demucs_device() -> str:
    return os.environ.get("REFERENCE_ENGINE_DEMUCS_DEVICE", "cpu")


def _load_demucs_model():
    from demucs.pretrained import get_model

    model = get_model(DEMUCS_MODEL)
    model.eval()
    return model


def _apply_demucs(model, wav: np.ndarray) -> np.ndarray:
    """wav: (channels, samples) bei model.samplerate -> (sources, channels, samples)."""
    import torch
    from demucs.apply import apply_model

    t = torch.from_numpy(wav)
    ref = t.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    t = (t - mean) / std
    with torch.no_grad():
        out = apply_model(model, t[None], device=_demucs_device(), split=True, overlap=0.25, progress=False)[0]
    out = out * std + mean
    return out.cpu().numpy()


def separate_demucs(path: str | Path, sha1: str | None = None, progress: ProgressFn | None = None) -> SeparationResult:
    cache = cache_dir() / "stems" / f"{sha1}-{DEMUCS_MODEL}" if sha1 else None
    if cache and all((cache / f"{n}.npy").is_file() for n in DEMUCS_STEMS):
        if progress:
            progress(0.6, "Stems aus Cache geladen")
        return SeparationResult("demucs", {n: np.load(cache / f"{n}.npy").astype(np.float32) for n in DEMUCS_STEMS})

    if progress:
        progress(0.15, f"Demucs ({DEMUCS_MODEL}) laedt Modell")
    model = _load_demucs_model()
    wav = load_stereo(path, sr=int(model.samplerate))
    if progress:
        progress(0.2, "Demucs trennt Stems (kann einige Minuten dauern)")
    sources = _apply_demucs(model, wav)
    stems: dict[str, np.ndarray] = {}
    for name, src in zip(model.sources, sources):
        mono = src.mean(axis=0)
        stems[name] = librosa.resample(mono, orig_sr=int(model.samplerate), target_sr=ANALYSIS_SR).astype(np.float32)

    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        for name, data in stems.items():
            np.save(cache / f"{name}.npy", data.astype(np.float16))
    return SeparationResult("demucs", stems)


def separate(path: str | Path, y: np.ndarray, method: str = "auto", sha1: str | None = None,
             progress: ProgressFn | None = None) -> tuple[SeparationResult, list[str]]:
    warnings: list[str] = []
    if method not in ("auto", "demucs", "bands"):
        raise ValueError(f"Unbekannte Trennmethode: {method}")
    if method in ("auto", "demucs"):
        if demucs_available():
            try:
                return separate_demucs(path, sha1=sha1, progress=progress), warnings
            except Exception as exc:  # Modell-Download/Torch-Fehler -> Fallback statt Abbruch
                warnings.append(f"Demucs fehlgeschlagen ({exc}); Band-Fallback verwendet.")
        elif method == "demucs":
            warnings.append("Demucs ist nicht installiert (uv sync --extra stems); Band-Fallback verwendet.")
        else:
            warnings.append("Demucs nicht installiert: grobe Band-Trennung (ohne Vocals) verwendet.")
    return separate_bands(y), warnings
