"""Installer gegen temporaere Verzeichnisse (ohne Engine-Setup, ohne Live)."""

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(args, env):
    return subprocess.run(["bash", str(ROOT / "install.sh"), *args], env=env, capture_output=True, text=True)


def test_install_loop_sketch_default(tmp_path):
    lib = tmp_path / "User Library"
    lib.mkdir()
    ls_cfg = tmp_path / "Application Support" / "LoopSketch"
    rr_cfg = tmp_path / "Application Support" / "ReferenceRebuilder"
    env = dict(
        os.environ,
        RR_USER_LIBRARY=str(lib),
        LS_CONFIG_DIR=str(ls_cfg),
        RR_CONFIG_DIR=str(rr_cfg),
    )

    res = run([], env)
    assert res.returncode == 0, res.stderr + res.stdout

    remote = lib / "Remote Scripts" / "LoopSketch"
    assert sorted(p.name for p in remote.iterdir()) == [
        "LoopSketch.py", "__init__.py", "commands.py", "server.py",
    ]
    device = lib / "Presets" / "Audio Effects" / "Max Audio Effect" / "Loop Sketch"
    names = {p.name for p in device.iterdir()}
    assert {"LoopSketch.amxd", "ls_node.js", "ls_core.js", "ls_orchestrator.js", "live_bridge.js"} <= names
    assert (device / "templates" / "index.json").is_file()
    assert len(list((device / "templates").glob("*.json"))) >= 7

    config = json.loads((ls_cfg / "config.json").read_text())
    assert config["product"] == "LoopSketch" and config["remote_port"] == 47823
    assert "Loop Sketch" in res.stdout or "To Arr" in res.stdout

    # RR nicht standardmaessig
    assert not (lib / "Remote Scripts" / "ReferenceRebuilder").exists()

    assert run(["--uninstall"], env).returncode == 0
    assert not remote.exists() and not device.exists() and not ls_cfg.exists()


def test_install_with_reference_rebuilder(tmp_path):
    lib = tmp_path / "User Library"
    lib.mkdir()
    ls_cfg = tmp_path / "Application Support" / "LoopSketch"
    rr_cfg = tmp_path / "Application Support" / "ReferenceRebuilder"
    env = dict(
        os.environ,
        RR_USER_LIBRARY=str(lib),
        LS_CONFIG_DIR=str(ls_cfg),
        RR_CONFIG_DIR=str(rr_cfg),
    )
    res = run(["--with-reference-rebuilder"], env)
    assert res.returncode == 0, res.stderr
    assert (lib / "Remote Scripts" / "LoopSketch").is_dir()
    assert (lib / "Remote Scripts" / "ReferenceRebuilder").is_dir()
    rr_device = lib / "Presets" / "Audio Effects" / "Max Audio Effect" / "Reference Rebuilder"
    assert (rr_device / "ReferenceRebuilder.amxd").is_file()
    config = json.loads((rr_cfg / "config.json").read_text())
    assert config["remote_port"] == 47822


def test_missing_user_library_and_bad_option(tmp_path):
    env = dict(
        os.environ,
        RR_USER_LIBRARY=str(tmp_path / "fehlt"),
        LS_CONFIG_DIR=str(tmp_path / "ls"),
        RR_CONFIG_DIR=str(tmp_path / "cfg"),
    )
    res = run([], env)
    assert res.returncode == 1 and "User Library" in res.stderr
    assert run(["--bogus"], env).returncode == 2


def test_scripts_are_valid_bash():
    for script in ("install.sh", "start-engine.sh"):
        assert subprocess.run(["bash", "-n", str(ROOT / script)]).returncode == 0
