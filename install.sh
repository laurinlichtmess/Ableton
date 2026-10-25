#!/usr/bin/env bash
# Installiert Loop Sketch (Max for Live) und optional den aelteren Reference Rebuilder.
#
#   ./install.sh                      Loop Sketch Device + Remote Script + Templates
#   ./install.sh --with-reference-rebuilder
#                                     zusaetzlich Reference Rebuilder (ohne Engine)
#   ./install.sh --with-engine        RR-Engine (Demucs) + RR Device/Script
#   ./install.sh --no-stems           Engine ohne Demucs
#   ./install.sh --skip-engine        Alias: nur Live-Dateien (wie Standard fuer Loop Sketch)
#   ./install.sh --uninstall          Live-Dateien und Konfiguration entfernen
#
# Pfade: RR_USER_LIBRARY, RR_CONFIG_DIR, LS_CONFIG_DIR.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_LIBRARY="${RR_USER_LIBRARY:-$HOME/Music/Ableton/User Library}"
RR_CONFIG_DIR="${RR_CONFIG_DIR:-$HOME/Library/Application Support/ReferenceRebuilder}"
LS_CONFIG_DIR="${LS_CONFIG_DIR:-$HOME/Library/Application Support/LoopSketch}"

LS_REMOTE_DIR="$USER_LIBRARY/Remote Scripts/LoopSketch"
LS_DEVICE_DIR="$USER_LIBRARY/Presets/Audio Effects/Max Audio Effect/Loop Sketch"

RR_REMOTE_DIR="$USER_LIBRARY/Remote Scripts/ReferenceRebuilder"
RR_DEVICE_DIR="$USER_LIBRARY/Presets/Audio Effects/Max Audio Effect/Reference Rebuilder"

ENGINE_PORT=47821
RR_REMOTE_PORT=47822
LS_REMOTE_PORT=47823

WITH_STEMS=1
WITH_ENGINE=0
WITH_RR=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-stems) WITH_STEMS=0 ;;
    --with-engine) WITH_ENGINE=1; WITH_RR=1 ;;
    --with-reference-rebuilder) WITH_RR=1 ;;
    --skip-engine) WITH_ENGINE=0 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }

if [[ $UNINSTALL -eq 1 ]]; then
  say "Entferne Loop Sketch / Reference Rebuilder Dateien"
  rm -rf "$LS_REMOTE_DIR" "$LS_DEVICE_DIR" "$LS_CONFIG_DIR"
  rm -rf "$RR_REMOTE_DIR" "$RR_DEVICE_DIR" "$RR_CONFIG_DIR"
  echo "Fertig. Engine-venv optional: rm -rf $ROOT/engine/.venv"
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Hinweis: Dieses Skript ist fuer macOS gedacht (gefunden: $(uname -s))." >&2
fi

if [[ ! -d "$USER_LIBRARY" ]]; then
  echo "User Library nicht gefunden: $USER_LIBRARY" >&2
  echo "Pfad in Live unter Einstellungen > Library pruefen und ggf. RR_USER_LIBRARY setzen." >&2
  exit 1
fi

# --- Loop Sketch (immer) ---
say "Kopiere Loop Sketch Remote Script nach $LS_REMOTE_DIR"
rm -rf "$LS_REMOTE_DIR"
mkdir -p "$LS_REMOTE_DIR"
cp "$ROOT"/remote_script/LoopSketch/*.py "$LS_REMOTE_DIR/"

say "Kopiere Loop Sketch Device nach $LS_DEVICE_DIR"
mkdir -p "$LS_DEVICE_DIR"
cp "$ROOT/m4l/LoopSketch/LoopSketch.amxd" "$ROOT/m4l/LoopSketch/LoopSketch.maxpat" "$LS_DEVICE_DIR/"
cp "$ROOT/m4l/js/ls_node.js" "$ROOT/m4l/js/ls_core.js" "$ROOT/m4l/js/ls_orchestrator.js" \
  "$ROOT/m4l/js/live_bridge.js" "$LS_DEVICE_DIR/"
mkdir -p "$LS_DEVICE_DIR/templates"
cp "$ROOT"/templates/*.json "$LS_DEVICE_DIR/templates/"

say "Schreibe Loop Sketch Konfiguration nach $LS_CONFIG_DIR/config.json"
mkdir -p "$LS_CONFIG_DIR"
json_escape() { local s="${1//\\/\\\\}"; printf '%s' "${s//\"/\\\"}"; }
cat >"$LS_CONFIG_DIR/config.json" <<EOF
{
  "product": "LoopSketch",
  "remote_host": "127.0.0.1",
  "remote_port": $LS_REMOTE_PORT,
  "templates_dir": "$(json_escape "$LS_DEVICE_DIR/templates")"
}
EOF

# --- Optional: Reference Rebuilder ---
if [[ $WITH_ENGINE -eq 1 ]]; then
  export PATH="$HOME/.local/bin:$PATH"
  if ! command -v uv >/dev/null 2>&1; then
    say "Installiere uv (Python-Paketmanager)"
    curl -LsSf https://astral.sh/uv/install.sh | sh
  fi
  say "Richte Analyse-Engine ein (engine/.venv)"
  cd "$ROOT/engine"
  if [[ $WITH_STEMS -eq 1 ]]; then
    uv sync --extra stems
    say "Lade Demucs-Modell (einmalig, ca. 80 MB)"
    uv run python -c "from demucs.pretrained import get_model; get_model('htdemucs')" \
      || echo "Modell-Download fehlgeschlagen - wird beim ersten Analysieren erneut versucht." >&2
  else
    uv sync
  fi
  cd "$ROOT"
  chmod +x "$ROOT/start-engine.sh"
fi

if [[ $WITH_RR -eq 1 ]]; then
  say "Kopiere Reference Rebuilder Remote Script nach $RR_REMOTE_DIR"
  rm -rf "$RR_REMOTE_DIR"
  mkdir -p "$RR_REMOTE_DIR"
  cp "$ROOT"/remote_script/ReferenceRebuilder/*.py "$RR_REMOTE_DIR/"

  say "Kopiere Reference Rebuilder Device nach $RR_DEVICE_DIR"
  mkdir -p "$RR_DEVICE_DIR"
  cp "$ROOT/m4l/ReferenceRebuilder.amxd" "$ROOT/m4l/ReferenceRebuilder.maxpat" "$RR_DEVICE_DIR/"
  cp "$ROOT"/m4l/js/*.js "$RR_DEVICE_DIR/"

  say "Schreibe RR-Konfiguration nach $RR_CONFIG_DIR/config.json"
  mkdir -p "$RR_CONFIG_DIR"
  cat >"$RR_CONFIG_DIR/config.json" <<EOF
{
  "engine_url": "http://127.0.0.1:$ENGINE_PORT",
  "remote_host": "127.0.0.1",
  "remote_port": $RR_REMOTE_PORT,
  "engine_start_command": ["$(json_escape "$ROOT/start-engine.sh")"],
  "separation": "auto"
}
EOF
fi

cat <<EOF

Fertig (Loop Sketch). Naechste Schritte:
  1. Live 11 neu starten.
  2. Optional: Einstellungen > Link/Tempo/MIDI > Control Surface "LoopSketch"
     (Eingang/Ausgang: Keine). To Arr braucht das Script nicht zwingend.
  3. Im Browser: Max for Live / Audio Effects → "LoopSketch" auf eine Spur ziehen.
  4. Template waehlen, Roles zuordnen, Session-Szene 1 mit Loops fuellen, **To Arr**.
EOF

if [[ $WITH_RR -eq 1 ]]; then
  cat <<EOF

Reference Rebuilder ebenfalls installiert.
  Control Surface: "ReferenceRebuilder". Engine: $ROOT/start-engine.sh --foreground
EOF
fi
