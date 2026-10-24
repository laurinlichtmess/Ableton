"""Strukturtests fuer das erzeugte Max-for-Live-Device (laeuft mit pytest aus engine/)."""

import importlib.util
import json
import re
import struct
from pathlib import Path

import pytest

M4L = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_device", M4L / "build_device.py")
build_device = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_device)


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("device")
    maxpat, amxd = build_device.build(out)
    return json.loads(maxpat.read_text()), amxd.read_bytes()


def parse_amxd(data: bytes) -> dict:
    assert data[:4] == b"ampf"
    assert struct.unpack("<I", data[4:8])[0] == 4
    assert data[8:12] == b"aaaa", "Audio Effect"
    assert data[12:16] == b"meta"
    meta_len = struct.unpack("<I", data[16:20])[0]
    off = 20 + meta_len
    assert data[off:off + 4] == b"ptch"
    length = struct.unpack("<I", data[off + 4:off + 8])[0]
    body = data[off + 8:]
    assert len(body) == length
    assert body.endswith(b"\x00")
    return json.loads(body.rstrip(b"\x00").decode("utf-8"))


def boxes(patch):
    return {b["box"]["id"]: b["box"] for b in patch["patcher"]["boxes"]}


def test_amxd_container_matches_maxpat(built):
    patch, data = built
    assert parse_amxd(data) == patch


def test_committed_files_are_up_to_date(built):
    patch, data = built
    assert json.loads((M4L / "ReferenceRebuilder.maxpat").read_text()) == patch, "python3 m4l/build_device.py ausfuehren"
    assert (M4L / "ReferenceRebuilder.amxd").read_bytes() == data


def test_lines_reference_existing_boxes_and_ports(built):
    patch, _ = built
    bx = boxes(patch)
    for line in patch["patcher"]["lines"]:
        src, out = line["patchline"]["source"]
        dst, inl = line["patchline"]["destination"]
        assert src in bx and dst in bx
        assert out < bx[src]["numoutlets"], f"{bx[src].get('text', bx[src]['maxclass'])} hat kein Outlet {out}"
        assert inl < bx[dst]["numinlets"]


def test_route_outlets_match_node_outputs(built):
    patch, _ = built
    node_src = (M4L / "js" / "rr_node.js").read_text()
    route = next(b for b in boxes(patch).values() if b.get("text", "").startswith("route status"))
    names = route["text"].split()[1:]
    assert route["numoutlets"] == len(names) + 1
    for name in names:
        if name.startswith("menu_"):
            assert '"menu_" + stem' in node_src
        else:
            assert f'outlet("{name}"' in node_src, f"rr_node.js sendet '{name}' nie"


def test_messages_to_node_have_handlers(built):
    patch, _ = built
    node_src = (M4L / "js" / "rr_node.js").read_text()
    handlers = set(re.findall(r"^\s{2}(\w+): function", node_src, re.M)) | set(re.findall(r'addHandler\("(\w+)"', node_src))
    bx = boxes(patch)
    node_id = next(i for i, b in bx.items() if b.get("text", "").startswith("node.script"))
    for line in patch["patcher"]["lines"]:
        if line["patchline"]["destination"][0] != node_id:
            continue
        src = bx[line["patchline"]["source"][0]]
        if src["maxclass"] == "message":
            selector = src["text"].split()[0]
        elif src.get("text", "").startswith("prepend"):
            selector = src["text"].split()[1]
        elif src.get("text", "").startswith("js"):
            selector = "lom_result"
        else:
            raise AssertionError(f"Unerwartete Quelle fuer node.script: {src}")
        assert selector in handlers, f"Kein Handler fuer '{selector}'"


def test_referenced_scripts_exist(built):
    patch, _ = built
    for b in boxes(patch).values():
        text = b.get("text", "")
        for script in re.findall(r"([\w]+\.js)", text):
            assert (M4L / "js" / script).is_file(), script


def test_presentation_fits_device_and_does_not_overlap(built):
    patch, _ = built
    rects = [(b.get("text") or b.get("varname") or b["maxclass"], b["presentation_rect"])
             for b in boxes(patch).values() if b.get("presentation")]
    assert len(rects) >= 15
    for name, (x, y, w, h) in rects:
        assert x >= 0 and y >= 0 and x + w <= build_device.DEVICE_WIDTH and y + h <= build_device.DEVICE_HEIGHT, name
    for i, (n1, a) in enumerate(rects):
        for n2, b in rects[i + 1:]:
            overlap = a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]
            assert not overlap, f"'{n1}' ueberlappt '{n2}'"


def test_live_parameters_unique(built):
    patch, _ = built
    names = [b["saved_attribute_attributes"]["valueof"]["parameter_longname"]
             for b in boxes(patch).values() if "saved_attribute_attributes" in b]
    assert len(names) == len(set(names)) == 6
