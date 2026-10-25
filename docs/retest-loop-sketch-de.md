# Retest: Loop Sketch (Abschnitts-Clips, 145 BPM)

Branch: `cursor/loop-sketch-section-clips-27b4` (Fix auf Loop-Sketch-MVP).  
Nach dem Fix: **ein Clip pro aktiver Region** (8-Takt-Loop gelooppt), **nicht** Dutzende identische 8-Bar-Kopien. Tempo immer **145**.

## Vor dem Test (Mac)

1. Repo aktualisieren / Branch auschecken, dann:
   ```bash
   cd ~/Documents/Ableton-Reference-Rebuilder
   ./install.sh
   ```
2. **Ableton Live vollständig beenden** (Cmd+Q) und neu öffnen — sonst bleibt altes JS im Speicher.

## Live 11 — Schritte

1. **Kopie** von CursorTest (oder leeres Set) — Musik-Projekt nicht anfassen.
2. Tempo darf egal sein; **To Arr setzt 145**.
3. In **Session-Szene 1** je Spur einen **ganzen ~8-Takt-Loop** (MIDI oder Audio) legen — nicht kleinere Schnipsel.
4. Device **Loop Sketch** laden (nicht „Reference Rebuilder“):  
   User Library → Presets → Audio Effects → Max Audio Effect → **Loop Sketch**.
5. Template z. B. **Techno — Techno Warehouse** wählen.
6. **Spuren** klicken; Mapping prüfen (Kick/Bass/Hats/… nach Namen); ggf. Menüs.
7. Arrangement leeren (oder Undo bereithalten), dann **To Arr**.

## Was du sehen musst (DoD)

| Check | Erwartung |
|--------|-----------|
| Tempo | Song-Tempo **145** |
| Locators | Intro, Build, Drop_A, Break, Drop_B, Outro (Namen ggf. mit `_`) über volle Template-Länge (~128 Takte Warehouse) |
| **Keine 20×-Kopie** | Pro Spur nur **wenige lange Clips** (z. B. Kick ≈ **2** Clips), nicht 14–20 kurze identische 8-Bar-Clips hintereinander |
| Loop-Brace | Jeder Clip: Länge = aktive Region (z. B. 64 Takte); **Loop-Klammer = 8 Takte** (Quelle loopt) |
| Arrangement | Kick **ohne** Clips im Break; Bass/Perc nur in Drops; Hats durchgehend → **unterschiedliche** Spuren = echte Struktur |
| Inhalt | Farbe + Noten/Audio der Session-Szene-1-Loops erhalten |

Wenn wieder „alles 20× kopiert“ aussieht: Live wirklich neu gestartet? Richtiges Device (**Loop Sketch**)? Install von diesem Branch?

Optional: Control Surface **LoopSketch**. Keine Engine/Demucs nötig.
