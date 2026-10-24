"""Installer gegen temporaere Verzeichnisse (ohne Engine-Setup, ohne Live)."""

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(args, env):
    return subprocess.run(["bash", str(ROOT / "install.sh"), *args], env=env, capture_output=True, text=True)


def test_install_and_uninstall(tmp_path):
    lib = tmp_path / "User Library"
    lib.mkdir()
    cfg = tmp_path / "Application Support" / "ReferenceRebuilder"
    env = dict(os.environ, RR_USER_LIBRARY=str(lib), RR_CONFIG_DIR=str(cfg))

    res = run(["--skip-engine"], env)
    assert res.returncode == 0, res.stderr

    remote = lib / "Remote Scripts" / "ReferenceRebuilder"
    assert sorted(p.name for p in remote.iterdir()) == ["ReferenceRebuilder.py", "__init__.py", "commands.py", "server.py"]
    device = lib / "Presets" / "Audio Effects" / "Max Audio Effect" / "Reference Rebuilder"
    names = {p.name for p in device.iterdir()}
    assert {"ReferenceRebuilder.amxd", "rr_node.js", "live_bridge.js", "rr_core.js", "rr_orchestrator.js",
            "rr_transport.js"} <= names
    config = json.loads((cfg / "config.json").read_text())
    assert config["engine_url"] == "http://127.0.0.1:47821" and config["remote_port"] == 47822
    assert config["engine_start_command"] == [str(ROOT / "start-engine.sh")]
    assert "Control Surface" in res.stdout

    # Erneut installieren ueberschreibt sauber.
    (remote / "alt.py").write_text("x")
    assert run(["--skip-engine"], env).returncode == 0
    assert not (remote / "alt.py").exists()

    assert run(["--uninstall"], env).returncode == 0
    assert not remote.exists() and not device.exists() and not cfg.exists()


def test_missing_user_library_and_bad_option(tmp_path):
    env = dict(os.environ, RR_USER_LIBRARY=str(tmp_path / "fehlt"), RR_CONFIG_DIR=str(tmp_path / "cfg"))
    res = run(["--skip-engine"], env)
    assert res.returncode == 1 and "User Library" in res.stderr
    assert run(["--bogus"], env).returncode == 2


def test_scripts_are_valid_bash():
    for script in ("install.sh", "start-engine.sh"):
        assert subprocess.run(["bash", "-n", str(ROOT / script)]).returncode == 0
