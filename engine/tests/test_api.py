import time

from fastapi.testclient import TestClient

from reference_engine import DEFAULT_PORT
from reference_engine.api import create_app


def fake_analyze(path, separation="auto", progress=None):
    if progress:
        progress(0.5, "halb")
    if "fail" in str(path):
        raise RuntimeError("kaputt")
    return {"schema_version": 1, "source": {"path": str(path)}, "separation": separation}


def client() -> TestClient:
    return TestClient(create_app(analyze=fake_analyze))


def test_health():
    r = client().get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["port"] == DEFAULT_PORT == 47821
    assert isinstance(body["demucs_available"], bool)


def test_analyze_sync(tmp_path):
    f = tmp_path / "a.mp3"
    f.write_bytes(b"x")
    r = client().post("/analyze", json={"path": str(f), "separation": "bands"})
    assert r.status_code == 200 and r.json()["separation"] == "bands"


def test_analyze_rejects_missing_and_bad_extension(tmp_path):
    c = client()
    assert c.post("/analyze", json={"path": str(tmp_path / "nope.mp3")}).status_code == 400
    txt = tmp_path / "a.txt"
    txt.write_text("x")
    assert c.post("/analyze", json={"path": str(txt)}).status_code == 400
    assert c.post("/analyze", json={"path": str(txt), "separation": "magic"}).status_code == 422


def _wait(c: TestClient, job_id: str) -> dict:
    for _ in range(100):
        body = c.get(f"/jobs/{job_id}").json()
        if body["status"] in ("done", "error"):
            return body
        time.sleep(0.02)
    raise AssertionError("Job wurde nicht fertig")


def test_job_lifecycle(tmp_path):
    f = tmp_path / "song.mp3"
    f.write_bytes(b"x")
    c = client()
    r = c.post("/jobs", json={"path": str(f)})
    assert r.status_code == 200
    body = _wait(c, r.json()["job_id"])
    assert body["status"] == "done" and body["progress"] == 1.0
    assert body["result"]["source"]["path"] == str(f)


def test_job_error_and_unknown(tmp_path):
    f = tmp_path / "fail.mp3"
    f.write_bytes(b"x")
    c = client()
    body = _wait(c, c.post("/jobs", json={"path": str(f)}).json()["job_id"])
    assert body["status"] == "error" and "kaputt" in body["error"]
    assert c.get("/jobs/doesnotexist").status_code == 404


def test_upload():
    r = client().post("/analyze/upload", files={"file": ("ref.mp3", b"abc", "audio/mpeg")},
                      data={"separation": "bands"})
    assert r.status_code == 200 and r.json()["separation"] == "bands"
