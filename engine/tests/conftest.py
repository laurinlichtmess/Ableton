from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from synth import SongSpec, write_song  # noqa: E402

from reference_engine.pipeline import analyze_file  # noqa: E402


@pytest.fixture(scope="session")
def song_mp3(tmp_path_factory) -> tuple[Path, SongSpec]:
    path = tmp_path_factory.mktemp("audio") / "reference.mp3"
    spec = write_song(path, fmt="MP3")
    return path, spec


@pytest.fixture(scope="session")
def analysis(song_mp3) -> dict:
    path, _ = song_mp3
    return analyze_file(path, separation="bands")
