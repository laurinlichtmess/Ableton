#!/usr/bin/env python3
"""Erzeugt ReferenceRebuilder.maxpat (lesbar, in Max oeffnbar) und ReferenceRebuilder.amxd (Max Audio Effect).

Nur Standardbibliothek. Aufruf:  python3 m4l/build_device.py [ausgabeordner]
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

DEVICE_NAME = "ReferenceRebuilder"
DEVICE_WIDTH = 640
DEVICE_HEIGHT = 169  # feste Hoehe von Live-Devices
STEMS = [("drums", "Drums"), ("bass", "Bass"), ("other", "Synths/Other"), ("vocals", "Vocals")]
NODE_OUTPUTS = ["status", "summary", "lom", "menu_drums", "menu_bass", "menu_other", "menu_vocals", "ready"]


class Patch:
    def __init__(self) -> None:
        self.boxes: list[dict] = []
        self.lines: list[dict] = []
        self._n = 0

    def box(self, maxclass: str, rect: list[float], *, text: str | None = None, inlets: int = 1,
            outlets: int = 0, outlettype: list[str] | None = None, pres: list[float] | None = None, **attrs) -> str:
        self._n += 1
        bid = f"obj-{self._n}"
        b = {"id": bid, "maxclass": maxclass, "numinlets": inlets, "numoutlets": outlets,
             "patching_rect": [float(v) for v in rect]}
        if outlets:
            b["outlettype"] = outlettype or [""] * outlets
        if text is not None:
            b["text"] = text
        if pres is not None:
            b["presentation"] = 1
            b["presentation_rect"] = [float(v) for v in pres]
        b.update(attrs)
        self.boxes.append({"box": b})
        return bid

    def obj(self, text: str, x: float, y: float, inlets: int = 1, outlets: int = 1, w: float | None = None, **kw) -> str:
        return self.box("newobj", [x, y, w or max(40, 7 * len(text) + 12), 22], text=text, inlets=inlets,
                        outlets=outlets, **kw)

    def msg(self, text: str, x: float, y: float) -> str:
        return self.box("message", [x, y, max(40, 7 * len(text) + 14), 22], text=text, inlets=2, outlets=1)

    def connect(self, src: str, outlet: int, dst: str, inlet: int = 0) -> None:
        self.lines.append({"patchline": {"source": [src, outlet], "destination": [dst, inlet]}})


def live_param(longname: str, shortname: str, initial: int | None = None, enum=("off", "on")) -> dict:
    v = {"parameter_enum": list(enum), "parameter_longname": longname, "parameter_mmax": len(enum) - 1,
         "parameter_shortname": shortname, "parameter_type": 2}
    if initial is not None:
        v["parameter_initial_enable"] = 1
        v["parameter_initial"] = [initial]
    return {"saved_attribute_attributes": {"valueof": v}, "parameter_enable": 1, "varname": longname}


def build_patch() -> dict:
    p = Patch()
    font = {"fontname": "Arial", "fontsize": 10.0}

    # Audio durchreichen (Audio Effect)
    plugin = p.obj("plugin~", 20, 20, inlets=1, outlets=2, outlettype=["signal", "signal"])
    plugout = p.obj("plugout~", 20, 400, inlets=2, outlets=0)
    p.connect(plugin, 0, plugout, 0)
    p.connect(plugin, 1, plugout, 1)

    node = p.obj("node.script rr_node.js @autostart 1 @watch 0", 300, 300, outlets=2, w=280)
    route = p.obj("route " + " ".join(NODE_OUTPUTS), 300, 340, inlets=2, outlets=len(NODE_OUTPUTS) + 1, w=420)
    p.connect(node, 0, route, 0)

    # Live API: node -> [prepend lom] -> [deferlow] -> [js] -> node
    pre_lom = p.obj("prepend lom", 380, 380)
    defer = p.obj("deferlow", 380, 410)
    bridge = p.obj("js live_bridge.js", 380, 440, w=110)
    p.connect(route, NODE_OUTPUTS.index("lom"), pre_lom)
    p.connect(pre_lom, 0, defer)
    p.connect(defer, 0, bridge)
    p.connect(bridge, 0, node)

    # --- Spalte 1: Drop, Buttons, Optionen ---
    drop = p.box("live.drop", [20, 80, 140, 60], inlets=1, outlets=2, pres=[4, 4, 144, 56],
                 varname="reference_drop", **font)
    pre_file = p.obj("prepend file", 20, 150)
    p.connect(drop, 0, pre_file)
    p.connect(pre_file, 0, node)

    def button(label: str, longname: str, message: str, x: float, pres: list[float]) -> str:
        b = p.box("live.text", [x, 190, 70, 18], inlets=1, outlets=2, pres=pres, text=label, texton=label,
                  mode=0, **live_param(longname, label), **font)
        r = p.obj("route bang 1", x, 215, inlets=2, outlets=3)
        t = p.obj("t b", x, 240, outlets=1)
        m = p.msg(message, x, 265)
        p.connect(b, 0, r)
        p.connect(r, 0, t)
        p.connect(r, 1, t)
        p.connect(t, 0, m)
        p.connect(m, 0, node)
        return b

    button("Analysieren", "analyze_button", "analyze", 20, [4, 64, 70, 18])
    button("Anwenden", "apply_button", "apply", 100, [78, 64, 70, 18])
    button("Spuren", "refresh_button", "refresh", 180, [4, 86, 70, 16])

    toggles = []
    for i, (name, label, short) in enumerate([("build_arrangement", "Arrangement anlegen", "Arrangement"),
                                              ("apply_automation", "Automation/Effekte", "Automation"),
                                              ("set_tempo", "Tempo übernehmen", "Tempo")]):
        y = 108 + i * 19
        tg = p.box("live.toggle", [20 + i * 90, 300, 15, 15], inlets=1, outlets=1, pres=[4, y + 2, 13, 13],
                   **live_param(name, short, initial=1))
        p.box("comment", [40 + i * 90, 300, 80, 18], text=label, pres=[20, y, 128, 18], ignoreclick=1, **font)
        pre = p.obj(f"prepend option {name}", 20 + i * 90, 330, w=85)
        p.connect(tg, 0, pre)
        p.connect(pre, 0, node)
        toggles.append(tg)

    # Nach Node-Start: Toggle-Werte erneut senden, dann init
    trig = p.obj("t b b b b", 600, 380, outlets=4)
    p.connect(route, NODE_OUTPUTS.index("ready"), trig)
    for i, tg in enumerate(toggles):
        p.connect(trig, i + 1, tg)
    delay = p.obj("delay 300", 600, 410, inlets=2, outlets=1)
    init = p.msg("init", 600, 440)
    p.connect(trig, 0, delay)
    p.connect(delay, 0, init)
    p.connect(init, 0, node)

    # --- Spalte 2: Zuordnung Stem -> Spur ---
    p.box("comment", [200, 20, 140, 18], text="Stem → Spur", pres=[154, 2, 146, 18], ignoreclick=1, **font)
    for i, (stem, label) in enumerate(STEMS):
        y = 22 + i * 36
        p.box("comment", [200, 40 + i * 30, 70, 18], text=label, pres=[154, y, 146, 16], ignoreclick=1, **font)
        menu = p.box("umenu", [280, 40 + i * 30, 120, 20], inlets=1, outlets=3, outlettype=["int", "", ""],
                     pres=[154, y + 16, 146, 18], items=["Auto", ",", "Keine"], varname=f"map_{stem}", **font)
        pre = p.obj(f"prepend map {stem}", 420, 40 + i * 30, w=110)
        p.connect(route, NODE_OUTPUTS.index(f"menu_{stem}"), menu)
        p.connect(menu, 1, pre)
        p.connect(pre, 0, node)

    # --- Spalte 3: Zusammenfassung + Status ---
    summary = p.box("textedit", [620, 40, 330, 140], inlets=1, outlets=4, outlettype=["", "int", "", ""],
                    pres=[306, 4, 330, 138], readonly=1, lines=0, varname="summary",
                    text="Analyse-Ergebnis erscheint hier.", **font)
    status = p.box("comment", [620, 190, 330, 18], text="Starte ...", pres=[306, 146, 330, 18],
                   ignoreclick=1, varname="status", **font)
    pre_sum = p.obj("prepend set", 620, 220)
    pre_status = p.obj("prepend set", 720, 220)
    p.connect(route, NODE_OUTPUTS.index("summary"), pre_sum)
    p.connect(pre_sum, 0, summary)
    p.connect(route, NODE_OUTPUTS.index("status"), pre_status)
    p.connect(pre_status, 0, status)

    return {
        "patcher": {
            "fileversion": 1,
            "appversion": {"major": 8, "minor": 1, "revision": 11, "architecture": "x64", "modernui": 1},
            "classnamespace": "box",
            "rect": [100.0, 100.0, 1000.0, 520.0],
            "openrect": [0.0, 0.0, float(DEVICE_WIDTH), float(DEVICE_HEIGHT)],
            "openinpresentation": 1,
            "devicewidth": float(DEVICE_WIDTH),
            "default_fontsize": 10.0,
            "default_fontname": "Arial",
            "gridsize": [8.0, 8.0],
            "description": "Analysiert eine Referenz-MP3 und baut Arrangement, Locators und Automation nach.",
            "boxes": p.boxes,
            "lines": p.lines,
            "dependency_cache": [
                {"name": "rr_node.js", "type": "TEXT", "implicit": 1},
                {"name": "live_bridge.js", "type": "TEXT", "implicit": 1},
            ],
            "latency": 0,
            "is_mpe": 0,
        }
    }


def amxd_bytes(patch: dict, device_type: bytes = b"aaaa") -> bytes:
    """Live-Device-Container: 'ampf' + Typ (aaaa = Audio Effect) + 'meta' + 'ptch' + Patcher-JSON."""
    body = json.dumps(patch, indent=1, ensure_ascii=False).encode("utf-8") + b"\n\x00"
    return (b"ampf" + struct.pack("<I", 4) + device_type
            + b"meta" + struct.pack("<I", 4) + struct.pack("<I", 0)
            + b"ptch" + struct.pack("<I", len(body)) + body)


def build(out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    patch = build_patch()
    maxpat = out_dir / f"{DEVICE_NAME}.maxpat"
    amxd = out_dir / f"{DEVICE_NAME}.amxd"
    maxpat.write_text(json.dumps(patch, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    amxd.write_bytes(amxd_bytes(patch))
    return maxpat, amxd


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    for f in build(target):
        print(f)
