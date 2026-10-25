import types

import numpy as np
import pytest
import soundfile as sf

from reference_engine import separation
from reference_engine.audio import ANALYSIS_SR


def test_bands_fallback_returns_three_stems():
    y = np.random.default_rng(0).normal(0, 0.1, ANALYSIS_SR * 3).astype(np.float32)
    res = separation.separate_bands(y)
    assert res.method == "bands"
    assert set(res.stems) == {"drums", "bass", "other"}
    assert all(len(s) == len(y) for s in res.stems.values())


def test_auto_without_demucs_warns(monkeypatch, tmp_path):
    monkeypatch.setattr(separation, "demucs_available", lambda: False)
    y = np.zeros(ANALYSIS_SR, dtype=np.float32)
    res, warnings = separation.separate(tmp_path / "x.wav", y, method="auto")
    assert res.method == "bands" and warnings
    res, warnings = separation.separate(tmp_path / "x.wav", y, method="demucs")
    assert res.method == "bands" and "uv sync --extra stems" in warnings[0]


def test_unknown_method():
    with pytest.raises(ValueError):
        separation.separate("x", np.zeros(10), method="spleeter")


def test_demucs_path_uses_model_and_cache(monkeypatch, tmp_path):
    """Demucs selbst ist in der Cloud nicht installiert: Modell und apply_model werden ersetzt."""
    sr_model = 44100
    wav_path = tmp_path / "in.wav"
    sf.write(wav_path, np.random.default_rng(1).normal(0, 0.1, (sr_model * 2, 2)).astype(np.float32), sr_model)
    fake_model = types.SimpleNamespace(samplerate=sr_model, sources=["drums", "bass", "other", "vocals"])
    calls = {"n": 0}

    def fake_apply(model, wav, device="cpu", progress=None):
        calls["n"] += 1
        assert wav.shape[0] == 2
        if progress:
            progress(0.9, "fake demucs")
        return np.stack([wav * (i + 1) * 0.1 for i in range(4)])

    monkeypatch.setenv("REFERENCE_ENGINE_CACHE", str(tmp_path / "cache"))
    monkeypatch.setattr(separation, "_load_demucs_model", lambda: fake_model)
    monkeypatch.setattr(separation, "_apply_demucs", fake_apply)
    monkeypatch.setattr(separation, "demucs_available", lambda: True)

    msgs = []
    res, warnings = separation.separate(wav_path, np.zeros(10), method="auto", sha1="abc",
                                        progress=lambda p, m: msgs.append((p, m)))
    assert res.method == "demucs" and not warnings
    assert set(res.stems) == {"drums", "bass", "other", "vocals"}
    assert abs(len(res.stems["bass"]) - ANALYSIS_SR * 2) < 10
    assert res.device
    assert any(p >= 0.9 for p, _ in msgs), "Fortschritt muss ueber den Startwert hinausgehen"

    res2, _ = separation.separate(wav_path, np.zeros(10), method="auto", sha1="abc")
    assert calls["n"] == 1, "zweiter Lauf muss aus dem Cache kommen"
    assert np.allclose(res2.stems["vocals"], res.stems["vocals"], atol=1e-3)


def test_resolve_device_respects_env(monkeypatch):
    monkeypatch.setenv("REFERENCE_ENGINE_DEMUCS_DEVICE", "cpu")
    assert separation.resolve_device() == "cpu"


def test_demucs_failure_falls_back(monkeypatch, tmp_path):
    monkeypatch.setattr(separation, "demucs_available", lambda: True)

    def boom(*a, **k):
        raise RuntimeError("kein Modell")

    monkeypatch.setattr(separation, "separate_demucs", boom)
    res, warnings = separation.separate(tmp_path / "x.wav", np.zeros(ANALYSIS_SR, dtype=np.float32))
    assert res.method == "bands" and "kein Modell" in warnings[0]
