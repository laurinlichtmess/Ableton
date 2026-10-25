#!/usr/bin/env bash
# Startet die Analyse-Engine auf 127.0.0.1:47821 (wird auch vom M4L-Device automatisch aufgerufen).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${RR_ENGINE_PORT:-47821}"
LOG_DIR="${RR_LOG_DIR:-$HOME/Library/Logs/ReferenceRebuilder}"

# Aus Live/Max gestartet fehlt der Login-PATH.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv nicht gefunden. Bitte zuerst ./install.sh ausfuehren." >&2
  exit 1
fi

if [[ "${1:-}" == "--foreground" ]]; then
  cd "$ROOT/engine"
  exec uv run reference-engine serve --host 127.0.0.1 --port "$PORT"
fi

mkdir -p "$LOG_DIR"
cd "$ROOT/engine"
exec uv run reference-engine serve --host 127.0.0.1 --port "$PORT" >>"$LOG_DIR/engine.log" 2>&1
