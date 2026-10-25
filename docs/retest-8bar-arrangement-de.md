# Retest: Arrangement aus 8-Takt-Loops (spielbarer Track)

Branch/PR: `cursor/8bar-loop-arrangement-8edd` → PR #4 (Ableton-Reference-Rebuilder).

## Vorbereitung

1. Im Repo: `./install.sh` (kopiert M4L + Remote Script).
2. **Ableton Live 11 neu starten** (sonst altes JS/Device).
3. Control Surface **ReferenceRebuilder** aktiv (Preferences → Link/MIDI).
4. Engine läuft (`./start-engine.sh` oder bereits `schema_version: 2` auf Port 47821).
5. **CursorTest** als **Kopie** öffnen (nicht das einzige Original).
6. Pro Element-Spur (`kick`, `hihat`, `clap`, `perc synth`, `303`, …): am Anfang liegt ein Loop
   (Session-Clip **oder** Arrangement bei Takt 1) **mit MIDI-Noten** bzw. Audio-Inhalt. Farbe merken.
   Leere MIDI-Clips zählen nicht als Quelle.

## Ablauf

1. Reference Rebuilder laden → Referenz-MP3 **neu** analysieren.
2. Zuordnung prüfen (MIDI bevorzugen): Kick→`kick`, Hats→`hihat`, Clap→`clap`, Bass→`303`,
   Synth/Perc→`perc synth`. Im Textfeld: `[Loop session|arrangement, … Beats, Farbe N]` – nicht `[kein Loop]`.
3. Optionen: **Arrangement anlegen** + **Automation** an → **Anwenden**.
4. Arrangement-Ansicht öffnen → Play ab Takt 1.

## Erwartung (Definition of Done)

| Check | Erwartung |
|--------|-----------|
| Play | Hörbares Arrangement aus deinen Loops, strukturiert wie die Referenz (Teile mit/ohne Element). |
| Noten | Keine leeren MIDI-Skeleton-Clips – duplizierte Loops behalten Noten (bzw. Audio). |
| Abschnitte | Pro aktivem Songteil Clip; wo Element in der Analyse fehlt → Stille (kein Clip). |
| Farbe | Wie Quell-Loop. |
| Tempo/Raster | Clips auf Bar-Starts (Locators = Songteile). |
| FX | Auto Filter / Utility **nur** wenn Automation wirklich geschrieben wurde. Keine leeren Filter+Utility. |
| Hinweise | Deutsche Meldungen wenn Spur ohne Loop / Audio-nur-Arrangement ohne Session für FX. |

## Wenn etwas fehlt

- „kein Loop am Spuranfang“ / leere MIDI → Noten in Slot 1 oder Arrangement bei Takt 1, dann **Spuren** aktualisieren.
- Utility/Filter ohne Kurven → sollte nach diesem Stand nicht mehr vorkommen; Live neu starten + `./install.sh`.
- Automation bei Arrangement-**Audio** → Loop in einen Session-Slot kopieren (Live-11-Limit).
- Log: `~/Library/Preferences/Ableton/Live 11.3.43/Log.txt` (keine `automation_envelope`-Fehler vom M4L-Pfad).

## Offline Dry-Check (ohne Live)

```bash
cd ~/Documents/Ableton-Reference-Rebuilder
node --test m4l/tests/*.test.js
node m4l/tests/dry_cursortest_apply.js
```

Erwartung Dry: `DRY OK — notes+structure+automation-with-devices`.
