import numpy as np
import pytest
from synth import SR, _hat, _kick

from reference_engine.tempo import estimate_grid


def click_track(bpm: float, offset: float, bars: int = 24, offbeat_hats: bool = True) -> np.ndarray:
    beat = 60.0 / bpm
    n = int((offset + bars * 4 * beat + 1.0) * SR)
    y = np.zeros(n)
    rng = np.random.default_rng(1)
    k = _kick(int(0.25 * SR))
    for b in range(bars * 4):
        o = int((offset + b * beat) * SR)
        y[o:o + len(k)] += k * (1.0 if b % 4 == 0 else 0.6)
        if offbeat_hats:
            h = int((offset + (b + 0.5) * beat) * SR)
            y[h:h + 300] += _hat(rng, 300) * 2
    return (y / np.abs(y).max()).astype(np.float32)


@pytest.mark.parametrize("bpm,offset", [(100.0, 0.4), (128.0, 0.1), (140.0, 1.0), (174.0, 0.25)])
def test_tempo_and_downbeat(bpm, offset):
    grid = estimate_grid(click_track(bpm, offset))
    assert grid.bpm == pytest.approx(bpm, abs=0.5)
    beat = 60.0 / bpm
    # Erster Taktanfang: offset oder ein ganzer Takt davor/danach ist nicht erlaubt, Abweichung < 40 ms.
    expected = offset % (4 * beat)
    assert abs(grid.first_downbeat_sec - expected) < 0.04
    assert grid.confidence > 0.8


def test_grid_conversions():
    grid = estimate_grid(click_track(120.0, 0.5))
    assert grid.beat_sec == pytest.approx(0.5, abs=0.01)
    assert float(grid.sec_to_beat(grid.beat_to_sec(10.0))) == pytest.approx(10.0)
    assert grid.num_bars == 24
    d = grid.to_dict()
    assert d["time_signature"] == [4, 4]
