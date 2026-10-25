"""Komplette Analyse einer Referenzdatei -> JSON-kompatibles dict (siehe schema/analysis.schema.json)."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

import numpy as np

from . import SCHEMA_VERSION, __version__
from .audio import ANALYSIS_SR, file_sha1, load_mono, validate_path
from .automation import curves_from_mag, filter_automation, gain_automation, sidechain_hint, stem_curves
from .elements import (ABSENT_BELOW_MIX_DB, DISPLAY_NAMES, ELEMENTS, PARENT_STEM, active_spans,
                       bar_levels_db, element_signals, presence_from_levels, presence_profile,
                       smooth_presence)
from .segments import ElementBars, Section, bar_features, segment_song
from .separation import resolve_device, separate
from .tempo import BeatGrid, TempoOptions, estimate_grid

ProgressFn = Callable[[float, str], None]


def _noop(_p: float, _m: str) -> None:
    pass


def _section_dict(s: Section, grid: BeatGrid) -> dict:
    bpb = grid.beats_per_bar
    return {
        "index": s.index,
        "label": s.label,
        "kind": s.kind,
        "group": s.group,
        "start_bar": s.start_bar,
        "end_bar": s.end_bar,
        "bars": s.bars,
        "start_beat": s.start_bar * bpb,
        "length_beats": s.bars * bpb,
        "start_sec": round(float(grid.beat_to_sec(s.start_bar * bpb)), 3),
        "end_sec": round(float(min(grid.beat_to_sec(s.end_bar * bpb), grid.duration_sec)), 3),
        "energy": round(s.energy, 3),
        "trend_db_per_bar": round(s.trend_db_per_bar, 3),
        "elements": list(s.elements),
        "added": list(s.added),
        "removed": list(s.removed),
    }


def _active_sections(present_bars: np.ndarray, sections: list[Section]) -> list[bool]:
    out = []
    for s in sections:
        seg = present_bars[s.start_bar:s.end_bar]
        out.append(bool(seg.size and seg.mean() >= 0.25))
    return out


def _map_progress(progress: ProgressFn, a: float, b: float) -> ProgressFn:
    def fn(p: float, msg: str) -> None:
        progress(a + (b - a) * max(0.0, min(1.0, p)), msg)
    return fn


def _analyze_elements(stems: dict[str, np.ndarray], mix: np.ndarray, method: str, grid: BeatGrid,
                      mix_level: float, progress: ProgressFn) -> tuple[ElementBars, list[dict], list[dict], list[dict]]:
    """Elemente erkennen, Presence/Automation berechnen. -> (bars, stems_out, suggestions, hints)."""
    bars_store: dict[str, np.ndarray] = {}
    present_store: dict[str, np.ndarray] = {}
    strength_store: dict[str, np.ndarray] = {}
    curves_store: dict = {}
    track_present: dict[str, bool] = {}
    signals = list(element_signals(stems, mix, method, grid, progress=_map_progress(progress, 0.0, 0.55)))
    for i, sig in enumerate(signals):
        progress(0.55 + 0.35 * i / max(1, len(signals)), f"Automation: {DISPLAY_NAMES.get(sig.name, sig.name)}")
        curves = curves_from_mag(sig.mag, grid)
        bar_db = bar_levels_db(curves.rms_db, grid.beats_per_bar, grid.num_bars)
        separated = method != "bands"
        present, loud = presence_from_levels(bar_db, sig.name, separated=separated)
        present = smooth_presence(present)
        in_track = loud >= mix_level - ABSENT_BELOW_MIX_DB and present.any()
        if not in_track:
            present = np.zeros(grid.num_bars, dtype=bool)
        bars_store[sig.name] = bar_db
        present_store[sig.name] = present
        strength_store[sig.name] = np.asarray(presence_profile(present, bar_db), dtype=float)
        curves_store[sig.name] = curves
        track_present[sig.name] = bool(in_track)
        del sig  # Spektrogramm freigeben

    # Fehlende Elemente (z. B. vocals ohne Demucs) als stumm eintragen.
    for name in ELEMENTS:
        if name not in present_store:
            present_store[name] = np.zeros(grid.num_bars, dtype=bool)
            strength_store[name] = np.zeros(grid.num_bars)
            bars_store[name] = np.full(grid.num_bars, -100.0)
            track_present[name] = False

    element_bars = ElementBars(present=present_store, strength=strength_store)
    # Sections brauchen die Presence; Aufrufer segmentiert danach. Hier nur Stem-Ausgabe vorbereiten
    # (active_sections wird nach der Segmentierung gesetzt).
    return element_bars, bars_store, curves_store, track_present


def analyze_audio(y: np.ndarray, path: str | Path, separation: str = "auto", sha1: str | None = None,
                  progress: ProgressFn = _noop, min_section_bars: int = 8,
                  tempo_options: TempoOptions | None = None) -> dict:
    progress(0.02, "Tempo und Beatgrid")
    opts = tempo_options or TempoOptions()
    grid = estimate_grid(y, options=opts)
    progress(0.08, "Takt-Merkmale")
    feat = bar_features(y, grid)

    sep_progress = _map_progress(progress, 0.1, 0.45)
    sep, warnings = separate(path, y, method=separation, sha1=sha1, progress=sep_progress)
    if grid.confidence < 0.5:
        warnings.append(f"Unsichere Beat-Erkennung (Konfidenz {grid.confidence:.2f}); Tempo bitte pruefen.")
    if opts.bpm_hint and abs(grid.bpm - opts.bpm_hint) > 0.5:
        warnings.append(f"Tempo {grid.bpm:.1f} weicht vom Hinweis {opts.bpm_hint:.1f} ab.")

    progress(0.45, "Elemente")
    mix_level = stem_curves(y, grid).level_db
    element_bars, bars_store, curves_store, track_present = _analyze_elements(
        sep.stems, y, sep.method, grid, mix_level, _map_progress(progress, 0.45, 0.85))

    progress(0.88, "Songteile")
    sections = segment_song(feat, element_bars, min_bars=min_section_bars)

    stems_out: list[dict] = []
    suggestions: list[dict] = []
    hints: list[dict] = []
    for name in ELEMENTS:
        present = track_present[name]
        curves = curves_store.get(name)
        bar_present = element_bars.present[name]
        if curves is None or not present:
            stems_out.append({
                "name": name,
                "display_name": DISPLAY_NAMES[name],
                "parent": PARENT_STEM.get(name),
                "separation": sep.method,
                "present": False,
                "level_db": round(float(np.percentile(bars_store[name], 90)) if bars_store[name].size else -100.0, 1),
                "active_sections": [False] * len(sections),
                "presence_bars": [False] * grid.num_bars,
                "presence": [0.0] * grid.num_bars,
                "active_spans": [],
                "automation": [],
            })
            continue
        filt = filter_automation(curves)
        gain = gain_automation(curves, exclude=filt["ramps"] if filt else None)
        automation = [a for a in (filt, gain) if a]
        stems_out.append({
            "name": name,
            "display_name": DISPLAY_NAMES[name],
            "parent": PARENT_STEM.get(name),
            "separation": sep.method,
            "present": True,
            "level_db": round(curves.level_db, 1),
            "active_sections": _active_sections(bar_present, sections),
            "presence_bars": [bool(v) for v in bar_present[:grid.num_bars]],
            "presence": [round(float(v), 2) for v in element_bars.strength[name][:grid.num_bars]],
            "active_spans": active_spans(bar_present[:grid.num_bars]),
            "automation": automation,
        })
        for a in automation:
            ramps = a.get("ramps", [])
            kind = "Cutoff-Sweep" if a["target"] == "filter_cutoff" else "Fade"
            where = ", ".join(f"Takt {r['start_beat'] // grid.beats_per_bar + 1}-{r['end_beat'] // grid.beats_per_bar}"
                              for r in ramps[:4])
            suggestions.append({
                "stem": name,
                "device": a["device"],
                "class_name": a["class_name"],
                "automation_target": a["target"],
                "reason": f"{len(ramps)} {kind}(s) erkannt: {where}",
            })
        if name == "bass":
            # Sidechain-Hinweis: Demucs-Bass-Stem, sonst Mix-Tiefband (Approximation).
            bass_audio = sep.stems.get("bass")
            if bass_audio is None:
                continue
            hint = sidechain_hint(bass_audio, grid, curves.active)
            if hint:
                hint["stem"] = name
                hint["message"] = (f"bass: beat-synchrones Pumpen (~{hint['depth_db']} dB) - "
                                   "Sidechain-Kompressor von der Kick empfohlen")
                hints.append(hint)

    progress(1.0, "Fertig")
    return {
        "schema_version": SCHEMA_VERSION,
        "engine_version": __version__,
        "source": {
            "path": str(path),
            "sha1": sha1,
            "duration_sec": round(len(y) / ANALYSIS_SR, 3),
            "sample_rate": ANALYSIS_SR,
        },
        "tempo": grid.to_dict(),
        "sections": [_section_dict(s, grid) for s in sections],
        "separation": sep.method,
        "device": resolve_device(),
        "stems": stems_out,
        "suggested_devices": suggestions,
        "hints": hints,
        "warnings": warnings,
    }


def analyze_file(path: str | Path, separation: str = "auto", progress: ProgressFn = _noop,
                 bpm_hint: float | None = None, bpm_min: float | None = None,
                 bpm_max: float | None = None) -> dict:
    p = validate_path(path)
    progress(0.01, "Audio laden")
    y = load_mono(p)
    return analyze_audio(y, p, separation=separation, sha1=file_sha1(p), progress=progress,
                         tempo_options=TempoOptions(bpm_hint=bpm_hint, bpm_min=bpm_min, bpm_max=bpm_max))
