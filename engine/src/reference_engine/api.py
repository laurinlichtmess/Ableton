"""Lokaler HTTP-Dienst (FastAPI) fuer das Max-for-Live-Device."""

from __future__ import annotations

import shutil
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from . import DEFAULT_PORT, SCHEMA_VERSION, __version__
from .audio import AudioError, validate_path
from .pipeline import analyze_file
from .separation import demucs_available

Separation = Literal["auto", "demucs", "bands"]
AnalyzeFn = Callable[..., dict]


class AnalyzeRequest(BaseModel):
    path: str
    separation: Separation = "auto"


class Job:
    def __init__(self, path: str, separation: str):
        self.id = uuid.uuid4().hex[:12]
        self.path = path
        self.separation = separation
        self.status = "queued"
        self.progress = 0.0
        self.message = "Wartet"
        self.result: dict | None = None
        self.error: str | None = None
        self.created = time.time()

    def to_dict(self, include_result: bool = True) -> dict:
        out = {"job_id": self.id, "status": self.status, "progress": round(self.progress, 3),
               "message": self.message, "error": self.error}
        if include_result and self.result is not None:
            out["result"] = self.result
        return out


def create_app(analyze: AnalyzeFn = analyze_file, max_jobs: int = 20) -> FastAPI:
    app = FastAPI(title="Reference Rebuilder Engine", version=__version__)
    # Ein Worker: Demucs belegt CPU/RAM voll, parallele Jobs bringen nichts.
    executor = ThreadPoolExecutor(max_workers=1)
    jobs: dict[str, Job] = {}
    lock = threading.Lock()

    def run_job(job: Job) -> None:
        job.status = "running"

        def progress(p: float, msg: str) -> None:
            job.progress, job.message = p, msg

        try:
            job.result = analyze(job.path, separation=job.separation, progress=progress)
            job.status, job.progress, job.message = "done", 1.0, "Fertig"
        except Exception as exc:
            job.status, job.error, job.message = "error", str(exc), "Fehler"

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "engine_version": __version__, "schema_version": SCHEMA_VERSION,
                "demucs_available": demucs_available(), "port": DEFAULT_PORT}

    @app.post("/analyze")
    def analyze_sync(req: AnalyzeRequest) -> dict:
        try:
            validate_path(req.path)
            return analyze(req.path, separation=req.separation)
        except AudioError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/analyze/upload")
    def analyze_upload(file: UploadFile = File(...), separation: Separation = Form("auto")) -> dict:
        suffix = Path(file.filename or "upload.mp3").suffix or ".mp3"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            shutil.copyfileobj(file.file, tmp)
        try:
            validate_path(tmp.name)
            return analyze(tmp.name, separation=separation)
        except AudioError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            Path(tmp.name).unlink(missing_ok=True)

    @app.post("/jobs")
    def create_job(req: AnalyzeRequest) -> dict:
        try:
            validate_path(req.path)
        except AudioError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        job = Job(req.path, req.separation)
        with lock:
            if len(jobs) >= max_jobs:
                oldest = sorted((j for j in jobs.values() if j.status in ("done", "error")), key=lambda j: j.created)
                for old in oldest[: len(jobs) - max_jobs + 1]:
                    jobs.pop(old.id, None)
            jobs[job.id] = job
        executor.submit(run_job, job)
        return job.to_dict(include_result=False)

    @app.get("/jobs/{job_id}")
    def get_job(job_id: str) -> dict:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Unbekannter Job")
        return job.to_dict()

    return app


def serve(host: str = "127.0.0.1", port: int = DEFAULT_PORT) -> None:
    import uvicorn

    uvicorn.run(create_app(), host=host, port=port, log_level="info")
