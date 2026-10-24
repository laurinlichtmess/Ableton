"""Komplette Analyse einer Referenzdatei -> JSON-kompatibles dict (siehe schema/analysis.schema.json)."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

import numpy as np

from . import SCHEMA_VERSION, __version__
from .audio import ANALYSIS_SR, file_sha1, load_mono, validate_path
from .automation import filter_automation, gain_automation, sidechain_hint, stem_curves
from .segments import Section, bar_features, segment_song
from .separation import separate
from .tempo import BeatGrid, estimate_grid

ProgressFn = Callable[[float, str], None]

STEM_ORDER = ("drums", "bass", "other", "vocals")


def _noop(_p: float, _m: str) -> None:
    pass


def _section_dict(s: Section, grid: BeatGrid) -> dict:
    bpb = grid.beats_per_bar
    return {
        "index": s.index,
        "label": s.label,
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
    }


def _active_sections(active_beats: np.ndarray, sections: list[Section], bpb: int) -> list[bool]:
    out = []
    for s in sections:
        seg = active_beats[s.start_bar * bpb:s.end_bar * bpb]
        out.append(bool(seg.size and seg.mean() >= 0.25))
    return out


def analyze_audio(y: np.ndarray, path: str | Path, separation: str = "auto", sha1: str | None = None,
                  progress: ProgressFn = _noop, min_section_bars: int = 4) -> dict:
    progress(0.05, "Tempo und Beatgrid")
    grid = estimate_grid(y)
    progress(0.1, "Songteile")
    feat = bar_features(y, grid)
    sections = segment_song(feat, min_bars=min_section_bars)

    sep, warnings = separate(path, y, method=separation, sha1=sha1, progress=progress)
    if grid.confidence < 0.5:
        warnings.append(f"Unsichere Beat-Erkennung (Konfidenz {grid.confidence:.2f}); Tempo bitte pruefen.")

    stems_out: list[dict] = []
    suggestions: list[dict] = []
    hints: list[dict] = []
    names = [n for n in STEM_ORDER if n in sep.stems] + [n for n in sep.stems if n not in STEM_ORDER]
    for i, name in enumerate(names):
        progress(0.6 + 0.35 * i / max(1, len(names)), f"Automation: {name}")
        curves = stem_curves(sep.stems[name], grid)
        filt = filter_automation(curves)
        gain = gain_automation(curves, exclude=filt["ramps"] if filt else None)
        automation = [a for a in (filt, gain) if a]
        stems_out.append({
            "name": name,
            "separation": sep.method,
            "level_db": round(curves.level_db, 1),
            "active_sections": _active_sections(curves.active, sections, grid.beats_per_bar),
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
        if name in ("bass", "other"):
            hint = sidechain_hint(sep.stems[name], grid, curves.active)
            if hint:
                hint["stem"] = name
                hint["message"] = (f"{name}: beat-synchrones Pumpen (~{hint['depth_db']} dB) - "
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
        "stems": stems_out,
        "suggested_devices": suggestions,
        "hints": hints,
        "warnings": warnings,
    }


def analyze_file(path: str | Path, separation: str = "auto", progress: ProgressFn = _noop) -> dict:
    p = validate_path(path)
    progress(0.01, "Audio laden")
    y = load_mono(p)
    return analyze_audio(y, p, separation=separation, sha1=file_sha1(p), progress=progress)
