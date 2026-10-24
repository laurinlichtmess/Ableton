#!/usr/bin/env bash
# Installiert den Ableton Reference Rebuilder (macOS, Live 11 Suite).
#
#   ./install.sh               Engine (mit Demucs) + Remote Script + M4L-Device + Konfiguration
#   ./install.sh --no-stems    ohne Demucs/PyTorch (schneller, grobe Stem-Trennung)
#   ./install.sh --skip-engine nur Live-Dateien kopieren
#   ./install.sh --uninstall   Live-Dateien und Konfiguration entfernen
#
# Pfade lassen sich fuer Tests ueberschreiben: RR_USER_LIBRARY, RR_CONFIG_DIR.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_LIBRARY="${RR_USER_LIBRARY:-$HOME/Music/Ableton/User Library}"
CONFIG_DIR="${RR_CONFIG_DIR:-$HOME/Library/Application Support/ReferenceRebuilder}"
REMOTE_DIR="$USER_LIBRARY/Remote Scripts/ReferenceRebuilder"
DEVICE_DIR="$USER_LIBRARY/Presets/Audio Effects/Max Audio Effect/Reference Rebuilder"
ENGINE_PORT=47821
REMOTE_PORT=47822

WITH_STEMS=1
SKIP_ENGINE=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-stems) WITH_STEMS=0 ;;
    --skip-engine) SKIP_ENGINE=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }

if [[ $UNINSTALL -eq 1 ]]; then
  say "Entferne Remote Script, Device und Konfiguration"
  rm -rf "$REMOTE_DIR" "$DEVICE_DIR" "$CONFIG_DIR"
  echo "Fertig. Die Engine (Ordner engine/.venv) kannst du mit 'rm -rf $ROOT/engine/.venv' loeschen."
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

if [[ $SKIP_ENGINE -eq 0 ]]; then
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
fi

say "Kopiere Remote Script nach $REMOTE_DIR"
rm -rf "$REMOTE_DIR"
mkdir -p "$REMOTE_DIR"
cp "$ROOT"/remote_script/ReferenceRebuilder/*.py "$REMOTE_DIR/"

say "Kopiere Max-for-Live-Device nach $DEVICE_DIR"
mkdir -p "$DEVICE_DIR"
cp "$ROOT/m4l/ReferenceRebuilder.amxd" "$ROOT/m4l/ReferenceRebuilder.maxpat" "$DEVICE_DIR/"
# Abhaengigkeiten flach neben das Device: Max sucht im Ordner des Devices.
cp "$ROOT"/m4l/js/*.js "$DEVICE_DIR/"

say "Schreibe Konfiguration nach $CONFIG_DIR/config.json"
mkdir -p "$CONFIG_DIR"
chmod +x "$ROOT/start-engine.sh"
json_escape() { local s="${1//\\/\\\\}"; printf '%s' "${s//\"/\\\"}"; }
cat >"$CONFIG_DIR/config.json" <<EOF
{
  "engine_url": "http://127.0.0.1:$ENGINE_PORT",
  "remote_host": "127.0.0.1",
  "remote_port": $REMOTE_PORT,
  "engine_start_command": ["$(json_escape "$ROOT/start-engine.sh")"],
  "separation": "auto"
}
EOF

cat <<EOF

Fertig. Naechste Schritte:
  1. Live 11 neu starten.
  2. Einstellungen > Link/Tempo/MIDI > Control Surface: "ReferenceRebuilder" waehlen (Eingang/Ausgang: Keine).
  3. Im Browser unter Max for Live / Audio Effects (bzw. User Library > Presets) "ReferenceRebuilder" auf eine Spur ziehen.
  4. Die Engine startet das Device bei Bedarf selbst; manuell: $ROOT/start-engine.sh --foreground
EOF
