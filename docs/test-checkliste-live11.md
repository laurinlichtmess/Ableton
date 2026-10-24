# Test-Checkliste: Live 11 Suite auf dem Mac

Diese Punkte lassen sich nur mit Live/Max testen (in der Cloud laufen Engine-, Logik- und Protokolltests).
Bitte bei Abweichungen die Nummer und die Meldung aus Statuszeile, Max-Konsole oder `Log.txt` notieren.

Vorbereitung: neues, leeres Live-Set mit vier **MIDI-Spuren** namens `Drums`, `Bass`, `Lead Synth`, `Vocals`
(je ein beliebiges Instrument) und einer Audiospur `Referenz`. Eine Referenz-MP3 mit klarer Struktur (z. B.
House/Techno mit Build und Drop) bereitlegen.

## A. Installation

- [ ] A1 `./install.sh` läuft ohne Fehler durch (Demucs-Modell wird geladen).
- [ ] A2 `./start-engine.sh --foreground` startet, `curl http://127.0.0.1:47821/health` liefert
      `"status":"ok"` und `"demucs_available":true`. Danach mit Ctrl-C beenden.
- [ ] A3 Nach Live-Neustart ist **ReferenceRebuilder** unter *Einstellungen › Link/Tempo/MIDI › Control
      Surface* wählbar; nach Auswahl erscheint „Reference Rebuilder bereit (UDP 47822)“.
- [ ] A4 In `Log.txt` steht „ReferenceRebuilder: lauscht auf UDP 127.0.0.1:47822“, keine Tracebacks.

## B. Device laden

- [ ] B1 Device aus *User Library › Presets › Audio Effects › Max Audio Effect › Reference Rebuilder* auf die
      Spur `Referenz` ziehen: Device erscheint mit Drop-Feld, drei Buttons, drei Optionen, vier Menüs,
      Textfeld und Statuszeile. Nichts überlappt, nichts ist abgeschnitten.
- [ ] B2 Statuszeile zeigt nach ca. 1–2 s „Bereit. MP3 auf das Feld ziehen.“ (nicht „Spuren nicht lesbar“).
- [ ] B3 Max-Konsole (Device bearbeiten › Max Console) zeigt keine roten Fehler zu `rr_node.js` oder
      `live_bridge.js`.
- [ ] B4 Die vier Menüs enthalten „Auto“, „Keine“ und `1: Drums` … `5: Referenz`.
- [ ] B5 Audio läuft unverändert durch das Device (Referenz abspielen).

## C. Analyse

- [ ] C1 MP3 aufs Drop-Feld ziehen: Status „Datei: <name>.mp3 – jetzt 'Analysieren'“ (auch bei Pfaden mit
      Leerzeichen und Umlauten testen).
- [ ] C2 Engine vorher **nicht** starten, dann **Analysieren**: Status „Starte Analyse-Engine …“, danach
      Fortschritt in Prozent; die Engine läuft anschließend im Hintergrund weiter.
- [ ] C3 Nach Abschluss: Textfeld zeigt Tempo (± 1 BPM gegenüber dem bekannten Tempo), plausible Songteile,
      Zuordnung (`drums -> 1: Drums` …) und Vorschläge.
- [ ] C4 Zweite Analyse derselben Datei geht deutlich schneller (Stem-Cache).
- [ ] C5 Doppelklick auf **Analysieren** während einer laufenden Analyse: Meldung „Bitte warten …“, kein
      zweiter Job.

## D. Anwenden (alle Optionen an)

- [ ] D1 **Anwenden**: Song-Tempo entspricht dem erkannten Tempo.
- [ ] D2 Im Arrangement stehen Locators an den Songteil-Anfängen mit den Namen aus dem Textfeld.
- [ ] D3 Auf `Drums`, `Bass`, `Lead Synth` (und ggf. `Vocals`) liegen benannte, eingefärbte MIDI-Clips an den
      Songteil-Positionen; Clip-Längen = Songteil-Längen. Kein Clip in Abschnitten, in denen der Stem
      schweigt (z. B. Drums im Breakdown).
- [ ] D4 Auf Spuren mit Sweep-Vorschlag wurde **Auto Filter** ans Ende der Kette eingefügt (Instrument bleibt
      vorne), bei Fade-Vorschlag **Utility**.
- [ ] D5 Clip-Envelope eines Build-Clips zeigt *Auto Filter › Frequency* als steigende Treppenkurve; beim
      Abspielen öffnet sich der Filter hörbar. Angezeigte Frequenzen passen ungefähr zur Referenz.
- [ ] D6 Utility-Gain-Envelope im Outro zeigt eine fallende Kurve in dB (0 dB außerhalb von Fades).
- [ ] D7 Keine zusätzliche Szene bleibt in der Session-Ansicht zurück; vorhandene Session-Clips unverändert.
- [ ] D8 Statuszeile: „Fertig: N Locators, M Clips, K Automationen, eingefügt: …“.
- [ ] D9 Cmd+Z macht die Änderungen schrittweise rückgängig, ohne dass Live hängt.

## E. Varianten und Fehlerfälle

- [ ] E1 Erneut **Anwenden**: keine doppelten Locators (nur umbenannt), Clips überschreiben die alten,
      keine zweiten Auto Filter.
- [ ] E2 Menü `bass` auf „Keine“: beim Anwenden bleibt die Bass-Spur unverändert.
- [ ] E3 Menü `other` auf `5: Referenz` (Audiospur): Hinweis „… ist eine Audiospur …“, Auto Filter wird dort
      trotzdem eingefügt, keine Clips.
- [ ] E4 Nur „Automation/Effekte“ an: keine Locators, kein Tempo; Clips nur in Abschnitten mit Automation.
- [ ] E5 Control Surface abwählen, dann **Anwenden**: Hinweis „nicht eingefügt: Remote Script antwortet
      nicht …“, vorhandene Auto Filter werden trotzdem automatisiert, Live bleibt stabil.
- [ ] E6 Engine beenden (`pkill -f "reference-engine serve"`), `start-engine.sh` vorübergehend umbenennen,
      **Analysieren**: verständliche Fehlermeldung nach max. ca. 40 s.
- [ ] E7 Set speichern, schließen, wieder öffnen: Optionen behalten ihren Zustand; Device startet wieder.
- [ ] E8 Während der Wiedergabe **Anwenden**: funktioniert, Wiedergabeposition springt höchstens kurz.

## F. Rückmeldung

Bitte melden: Live-Version (*Live › Über Live*), macOS-Version, Mac-Modell, die Analyse-JSON
(`uv run reference-engine analyze datei.mp3 -o analyse.json`) und die fehlgeschlagenen Punkte.
