import ast
import json
import socket
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ReferenceRebuilder.commands import CommandHandler, find_browser_item  # noqa: E402
from ReferenceRebuilder.server import UdpServer  # noqa: E402


class Item:
    def __init__(self, name, children=(), loadable=True):
        self.name = name
        self.children = list(children)
        self.is_loadable = loadable


class Device:
    def __init__(self, name, class_name):
        self.name = name
        self.class_name = class_name


class Track:
    def __init__(self, name, devices=()):
        self.name = name
        self.devices = list(devices)


class View:
    def __init__(self):
        self.selected_track = None
        self.selected_device = None

    def select_device(self, device):
        self.selected_device = device


class Browser:
    CLASS = {"Auto Filter": "AutoFilter", "Utility": "StereoGain"}

    def __init__(self, song):
        self.song = song
        self.loaded = []
        self.audio_effects = Item("Audio Effects", [
            Item("Auto Filter", [Item("Presets", [Item("Auto Filter.adv")], loadable=False)]),
            Item("Dynamics", [Item("Compressor")], loadable=False),
            Item("Utility"),
        ], loadable=False)
        self.instruments = Item("Instruments", [Item("Operator")], loadable=False)
        self.midi_effects = Item("MIDI Effects", [], loadable=False)

    def load_item(self, item):
        track = self.song.view.selected_track
        self.loaded.append((item.name, track.name, self.song.view.selected_device))
        track.devices.append(Device(item.name, self.CLASS.get(item.name, item.name)))


class App:
    def __init__(self, browser):
        self.browser = browser

    def get_major_version(self):
        return 11

    def get_minor_version(self):
        return 3

    def get_bugfix_version(self):
        return 25


def make():
    song = types.SimpleNamespace(tracks=[Track("Drums", [Device("Drum Rack", "DrumGroupDevice")]), Track("Pad")],
                                 view=View())
    browser = Browser(song)
    logs = []
    handler = CommandHandler(lambda: song, lambda: App(browser), log=logs.append)
    return handler, song, browser, logs


def test_find_browser_item_prefers_device_over_preset():
    root = Browser(types.SimpleNamespace()).audio_effects
    assert find_browser_item(root, "auto filter").name == "Auto Filter"
    assert find_browser_item(root, "Compressor").name == "Compressor"
    assert find_browser_item(root, "Dynamics") is None, "Ordner sind nicht ladbar"
    assert find_browser_item(root, "Reverb") is None


def test_load_device_appends_after_last_device():
    handler, song, browser, logs = make()
    r = handler.handle({"id": "a1", "cmd": "load_device", "track_index": 0, "device": "Auto Filter"})
    assert r == {"id": "a1", "ok": True, "device": "Auto Filter", "track": "Drums", "devices_before": 1}
    assert song.view.selected_track is song.tracks[0]
    assert browser.loaded[0][2].name == "Drum Rack", "letztes Device muss vor dem Laden ausgewaehlt sein"
    assert [d.class_name for d in song.tracks[0].devices] == ["DrumGroupDevice", "AutoFilter"]
    r = handler.handle({"id": "a2", "cmd": "load_device", "track_index": 1, "device": "Utility"})
    assert r["ok"] and r["devices_before"] == 0
    assert song.tracks[1].devices[0].class_name == "StereoGain"
    assert logs


@pytest.mark.parametrize("msg,error", [
    ({"cmd": "load_device", "track_index": 5, "device": "Utility"}, "existiert nicht"),
    ({"cmd": "load_device", "track_index": "x", "device": "Utility"}, "track_index"),
    ({"cmd": "load_device", "track_index": 0}, "device fehlt"),
    ({"cmd": "load_device", "track_index": 0, "device": "Reverb"}, "nicht im Browser"),
    ({"cmd": "load_device", "track_index": 0, "device": "Utility", "category": "samples"}, "Kategorie"),
    ({"cmd": "explode"}, "Unbekannter Befehl"),
])
def test_errors(msg, error):
    handler, _, _, _ = make()
    r = handler.handle(dict(msg, id="e"))
    assert r["ok"] is False and error in r["error"] and r["id"] == "e"


def test_unexpected_live_exception_is_reported():
    handler, song, browser, logs = make()

    def boom(item):
        raise RuntimeError("Changes cannot be triggered by notifications")

    browser.load_item = boom
    r = handler.handle({"cmd": "load_device", "track_index": 0, "device": "Utility"})
    assert r["ok"] is False and "RuntimeError" in r["error"]
    assert any("Fehler" in line for line in logs)


def test_ping_and_list():
    handler, _, _, _ = make()
    assert handler.handle({"cmd": "ping"})["live_version"] == "11.3.25"
    assert handler.handle({"cmd": "list_devices", "track_index": 0})["devices"] == [
        {"name": "Drum Rack", "class_name": "DrumGroupDevice"}]
    assert handler.handle(["kein", "dict"])["ok"] is False


def test_udp_roundtrip():
    handler, song, _, _ = make()
    server = UdpServer(handler.handle, port=0)
    assert server.start()
    client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    client.settimeout(2)
    try:
        assert server.poll() == 0, "leere Queue blockiert nicht"
        client.sendto(json.dumps({"id": 1, "cmd": "load_device", "track_index": 1, "device": "Auto Filter"}).encode(),
                      ("127.0.0.1", server.port))
        client.sendto(b"{kaputt", ("127.0.0.1", server.port))
        import time
        deadline = time.time() + 2
        handled = 0
        while handled < 2 and time.time() < deadline:
            handled += server.poll()
        replies = [json.loads(client.recvfrom(65535)[0]) for _ in range(2)]
        assert replies[0]["ok"] and replies[0]["id"] == 1
        assert replies[1] == {"ok": False, "error": "Ungueltiges JSON"}
        assert song.tracks[1].devices[0].name == "Auto Filter"
    finally:
        client.close()
        server.close()
    assert server.poll() == 0


def test_port_in_use_is_logged_not_raised():
    blocker = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    blocker.bind(("127.0.0.1", 0))
    logs = []
    server = UdpServer(lambda m: m, port=blocker.getsockname()[1], log=logs.append)
    try:
        assert server.start() is False
        assert server.poll() == 0
        assert "nicht verfuegbar" in logs[0]
    finally:
        blocker.close()


def test_control_surface_wiring(monkeypatch):
    """ReferenceRebuilder.py mit nachgebautem _Framework (in Live vorhanden, hier nicht)."""
    events = []

    class FakeControlSurface(object):
        def __init__(self, c_instance):
            self.c_instance = c_instance

        def component_guard(self):
            import contextlib
            return contextlib.nullcontext()

        def song(self):
            return types.SimpleNamespace(tracks=[], view=View())

        def application(self):
            return App(Browser(None))

        def log_message(self, msg):
            events.append(("log", msg))

        def show_message(self, msg):
            events.append(("show", msg))

        def update_display(self):
            events.append(("update",))

        def disconnect(self):
            events.append(("disconnect",))

    fw = types.ModuleType("_Framework")
    cs = types.ModuleType("_Framework.ControlSurface")
    cs.ControlSurface = FakeControlSurface
    monkeypatch.setitem(sys.modules, "_Framework", fw)
    monkeypatch.setitem(sys.modules, "_Framework.ControlSurface", cs)
    monkeypatch.setattr("ReferenceRebuilder.server.PORT", 0)
    import importlib

    import ReferenceRebuilder
    mod = importlib.import_module("ReferenceRebuilder.ReferenceRebuilder")
    monkeypatch.setattr(mod, "PORT", 0)
    instance = ReferenceRebuilder.create_instance(object())
    try:
        assert any(e[0] == "show" and "bereit" in e[1] for e in events)
        port = instance._server.port
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.settimeout(2)
        client.sendto(json.dumps({"id": "p", "cmd": "ping"}).encode(), ("127.0.0.1", port))
        import time
        time.sleep(0.05)
        instance.update_display()
        reply = json.loads(client.recvfrom(65535)[0])
        assert reply["ok"] and reply["live_version"] == "11.3.25"
        assert ("update",) in events
        client.close()
    finally:
        instance.disconnect()
    assert ("disconnect",) in events and instance._server.port is None


def test_node_client_talks_to_python_server():
    """Protokoll-Vertrag: rr_transport.udpRequest (M4L) <-> UdpServer (Remote Script)."""
    import shutil
    import subprocess
    import time

    node = shutil.which("node")
    if not node:
        pytest.skip("node nicht installiert")
    handler, song, _, _ = make()
    server = UdpServer(handler.handle, port=0)
    assert server.start()
    transport = ROOT.parent / "m4l" / "js" / "rr_transport.js"
    script = (
        "const t=require(%s);"
        "t.udpRequest('127.0.0.1',%d,{cmd:'load_device',track_index:1,device:'Utility'},3000)"
        ".then(r=>{console.log(JSON.stringify(r));return t.udpRequest('127.0.0.1',%d,{cmd:'load_device',track_index:9,device:'Utility'},3000)})"
        ".catch(e=>{console.log('ERR '+e.message)})"
    ) % (json.dumps(str(transport)), server.port, server.port)
    proc = subprocess.Popen([node, "-e", script], stdout=subprocess.PIPE, text=True)
    try:
        deadline = time.time() + 10
        while proc.poll() is None and time.time() < deadline:
            server.poll()
            time.sleep(0.01)
        out = proc.communicate(timeout=5)[0].strip().splitlines()
    finally:
        server.close()
    first = json.loads(out[0])
    assert first["ok"] and first["device"] == "Utility" and first["id"].startswith("n")
    assert out[1].startswith("ERR Spur 9 existiert nicht")
    assert song.tracks[1].devices[0].class_name == "StereoGain"


@pytest.mark.parametrize("path", sorted((ROOT / "ReferenceRebuilder").glob("*.py")), ids=lambda p: p.name)
def test_python37_grammar(path):
    ast.parse(path.read_text(), filename=str(path), feature_version=(3, 7))
