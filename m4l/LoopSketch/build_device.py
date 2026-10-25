#!/usr/bin/env python3
"""Erzeugt LoopSketch.maxpat und LoopSketch.amxd (Max Audio Effect).

Nur Standardbibliothek. Aufruf:  python3 m4l/LoopSketch/build_device.py [ausgabeordner]
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

DEVICE_NAME = "LoopSketch"
DEVICE_WIDTH = 640
DEVICE_HEIGHT = 260
ROLES = [
    ("kick", "Kick"), ("bass", "Bass"), ("hats", "Hats"), ("perc", "Perc"),
    ("synth", "Synth"), ("pad", "Pad"), ("fx", "FX"),
]
NODE_OUTPUTS = ["status", "summary", "lom", "menu_template"] + [f"menu_{r}" for r, _ in ROLES] + ["ready"]


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
    font_sm = {"fontname": "Arial", "fontsize": 9.0}

    plugin = p.obj("plugin~", 20, 20, inlets=1, outlets=2, outlettype=["signal", "signal"])
    plugout = p.obj("plugout~", 20, 400, inlets=2, outlets=0)
    p.connect(plugin, 0, plugout, 0)
    p.connect(plugin, 1, plugout, 1)

    node = p.obj("node.script ls_node.js @autostart 1 @watch 0", 300, 300, outlets=2, w=280)
    route = p.obj("route " + " ".join(NODE_OUTPUTS), 300, 340, inlets=2, outlets=len(NODE_OUTPUTS) + 1, w=560)
    p.connect(node, 0, route, 0)

    pre_lom = p.obj("prepend lom", 380, 380)
    defer = p.obj("deferlow", 380, 410)
    bridge = p.obj("js live_bridge.js", 380, 440, w=110)
    p.connect(route, NODE_OUTPUTS.index("lom"), pre_lom)
    p.connect(pre_lom, 0, defer)
    p.connect(defer, 0, bridge)
    p.connect(bridge, 0, node)

    p.box("comment", [20, 20, 120, 18], text="Loop Sketch",
          pres=[4, 4, 120, 16], ignoreclick=1, fontname="Arial", fontsize=12.0)

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

    button("To Arr", "to_arr_button", "to_arr", 20, [4, 56, 70, 18])
    button("Spuren", "refresh_button", "refresh", 100, [78, 56, 70, 18])

    # Tempo-Hinweis optional
    tg = p.box("live.toggle", [180, 300, 15, 15], inlets=1, outlets=1, pres=[154, 58, 13, 13],
               **live_param("set_tempo", "Tempo", initial=0))
    p.box("comment", [200, 300, 100, 18], text="BPM-Hinweis setzen",
          pres=[170, 56, 120, 16], ignoreclick=1, **font_sm)
    pre_opt = p.obj("prepend option set_tempo", 180, 330, w=120)
    p.connect(tg, 0, pre_opt)
    p.connect(pre_opt, 0, node)

    # Template-Menue
    p.box("comment", [20, 60, 100, 18], text="Template",
          pres=[4, 80, 80, 14], ignoreclick=1, **font)
    tmpl = p.box("umenu", [20, 80, 200, 18], inlets=1, outlets=3, outlettype=["int", "", ""],
                 pres=[4, 96, 200, 18], items=["(laden)"], varname="template_menu", **font_sm)
    pre_tmpl = p.obj("prepend template", 20, 110, w=100)
    p.connect(route, NODE_OUTPUTS.index("menu_template"), tmpl)
    p.connect(tmpl, 1, pre_tmpl)
    p.connect(pre_tmpl, 0, node)

    # Role → Spur
    p.box("comment", [20, 140, 140, 18], text="Role → Spur",
          pres=[220, 4, 120, 14], ignoreclick=1, **font)
    for i, (role, label) in enumerate(ROLES):
        col, row = i // 4, i % 4
        x_pres = 220 + col * 100
        y_pres = 20 + row * 36
        p.box("comment", [240 + col * 160, 40 + row * 36, 70, 18], text=label,
              pres=[x_pres, y_pres, 90, 12], ignoreclick=1, **font_sm)
        menu = p.box("umenu", [320 + col * 160, 40 + row * 36, 100, 18], inlets=1, outlets=3,
                     outlettype=["int", "", ""],
                     pres=[x_pres, y_pres + 12, 90, 16], items=["Auto", ",", "Keine"],
                     varname=f"map_{role}", **font_sm)
        pre = p.obj(f"prepend map {role}", 460 + col * 160, 40 + row * 36, w=110)
        p.connect(route, NODE_OUTPUTS.index(f"menu_{role}"), menu)
        p.connect(menu, 1, pre)
        p.connect(pre, 0, node)

    summary = p.box("textedit", [620, 40, 330, 180], inlets=1, outlets=4, outlettype=["", "int", "", ""],
                    pres=[420, 4, 216, 230], readonly=1, lines=0, varname="summary",
                    text="Template und Zuordnung erscheinen hier.", **font_sm)
    status = p.box("comment", [620, 230, 330, 18], text="Starte ...",
                   pres=[4, 238, 632, 18], ignoreclick=1, varname="status", **font)
    pre_sum = p.obj("prepend set", 620, 280)
    pre_status = p.obj("prepend set", 720, 280)
    p.connect(route, NODE_OUTPUTS.index("summary"), pre_sum)
    p.connect(pre_sum, 0, summary)
    p.connect(route, NODE_OUTPUTS.index("status"), pre_status)
    p.connect(pre_status, 0, status)

    # Nach Node-Start: Toggle + init
    trig = p.obj("t b b", 600, 380, outlets=2)
    p.connect(route, NODE_OUTPUTS.index("ready"), trig)
    p.connect(trig, 1, tg)
    delay = p.obj("delay 300", 600, 410, inlets=2, outlets=1)
    init = p.msg("init", 600, 440)
    p.connect(trig, 0, delay)
    p.connect(delay, 0, init)
    p.connect(init, 0, node)

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
            "description": "Loop Sketch: Genre-Templates auf Session-Szene-1-Loops anwenden (To Arr).",
            "boxes": p.boxes,
            "lines": p.lines,
            "dependency_cache": [
                {"name": "ls_node.js", "type": "TEXT", "implicit": 1},
                {"name": "live_bridge.js", "type": "TEXT", "implicit": 1},
            ],
            "latency": 0,
            "is_mpe": 0,
        }
    }


def amxd_bytes(patch: dict, device_type: bytes = b"aaaa") -> bytes:
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
