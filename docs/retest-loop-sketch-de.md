# Retest: Loop Sketch (MVP)

Branch/PR: `cursor/loop-sketch-mvp-06d9`

## Cloud / ohne Live

```bash
node --test m4l/tests/ls_*.test.js
node m4l/tests/dry_loop_sketch.js
python3 -m pytest tests/test_installer.py m4l/tests/test_ls_device.py -q
```

Erwartung Dry: `DRY OK — loop-sketch-templates+scene1-tiles+locators+colors`

## Live 11 (Mac)

1. `./install.sh` → Live **neu starten**.
2. Optional Control Surface **LoopSketch** (nicht nötig für To Arr).
3. CursorTest-Kopie oder leeres Set: MIDI-Spuren z. B. `Kick`, `Bass`, `Hats`, `Perc`, `Synth`, `Pad`, `FX`.
4. In **Session-Szene 1** je Spur einen ~8-Takt-Loop (mit Noten bzw. Audio) ablegen; Farben merken.
5. Device **LoopSketch** auf eine Spur ziehen.
6. Template **Techno — Techno Warehouse** (oder Peak / Hypnotic) wählen.
7. Mapping prüfen (Auto nach Namen); ggf. Menüs anpassen; **Spuren** klicken.
8. Arrangement leeren bzw. speichern, dann **To Arr**.
9. Prüfen:
   - Locators an Intro/Build/Drop/Break/…
   - Kick **ohne** Clips im Break (Presence `false`)
   - Aktive Regionen: Loop gekachelt, **gleiche Farbe**, Noten/Audio hörbar
   - Volle Template-Länge (Warehouse = 128 Takte)
10. House Classic / Tech House Groove kurz wiederholen (andere Presence).

## Fehlerzeichen

| Symptom | Check |
|--------|--------|
| „kein Clip in Session-Szene 1“ | Loop wirklich in der **ersten** Session-Zeile? |
| Keine Locators | Live-API / Device-JS neben `.amxd`? Max-Konsole |
| Leere MIDI-Clips | Quellclip hat Noten? (Audio: `note_count` = −1 ok) |
| Falsche Spur | Role-Menü / **Spuren** erneut |
