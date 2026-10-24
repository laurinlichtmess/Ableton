from __future__ import annotations

import argparse
import json
import sys

from . import DEFAULT_HOST, DEFAULT_PORT


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="reference-engine", description="Reference Rebuilder Analyse-Engine")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_serve = sub.add_parser("serve", help="HTTP-Dienst fuer das Max-for-Live-Device starten")
    p_serve.add_argument("--host", default=DEFAULT_HOST)
    p_serve.add_argument("--port", type=int, default=DEFAULT_PORT)

    p_an = sub.add_parser("analyze", help="Datei analysieren und JSON ausgeben")
    p_an.add_argument("path")
    p_an.add_argument("-o", "--output", help="JSON-Datei (Standard: stdout)")
    p_an.add_argument("--separation", choices=["auto", "demucs", "bands"], default="auto")

    args = parser.parse_args(argv)
    if args.cmd == "serve":
        from .api import serve

        serve(args.host, args.port)
        return 0

    from .pipeline import analyze_file

    def progress(p: float, msg: str) -> None:
        print(f"[{p * 100:5.1f}%] {msg}", file=sys.stderr)

    result = analyze_file(args.path, separation=args.separation, progress=progress)
    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
