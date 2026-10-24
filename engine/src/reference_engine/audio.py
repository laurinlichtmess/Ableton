from __future__ import annotations

import hashlib
from pathlib import Path

import librosa
import numpy as np

ANALYSIS_SR = 22050
HOP = 512
SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".aif", ".aiff", ".flac", ".ogg", ".m4a"}


class AudioError(ValueError):
    pass


def validate_path(path: str | Path) -> Path:
    p = Path(path).expanduser()
    if not p.is_file():
        raise AudioError(f"Datei nicht gefunden: {p}")
    if p.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise AudioError(f"Nicht unterstuetztes Format: {p.suffix} (erlaubt: {', '.join(sorted(SUPPORTED_EXTENSIONS))})")
    return p


def load_mono(path: str | Path, sr: int = ANALYSIS_SR) -> np.ndarray:
    y, _ = librosa.load(str(path), sr=sr, mono=True)
    if y.size == 0:
        raise AudioError(f"Leere Audiodatei: {path}")
    return y.astype(np.float32)


def load_stereo(path: str | Path, sr: int) -> np.ndarray:
    y, _ = librosa.load(str(path), sr=sr, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    return y.astype(np.float32)


def file_sha1(path: str | Path) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def frames_to_time(frames, sr: int = ANALYSIS_SR, hop: int = HOP):
    return librosa.frames_to_time(frames, sr=sr, hop_length=hop)


def db(x: np.ndarray, floor_db: float = -100.0) -> np.ndarray:
    return np.maximum(20.0 * np.log10(np.maximum(x, 1e-12)), floor_db)
