# Befehle des Remote Scripts. Keine Live-Imports: song/application werden hereingereicht.
# Python 3.7 (Live 11): keine Walrus-Operatoren, keine match-Statements, keine neuen Typ-Generics.

VERSION = "0.1.0"
BROWSER_CATEGORIES = ("audio_effects", "instruments", "midi_effects")
MAX_SEARCH_DEPTH = 4


class CommandError(Exception):
    pass


def find_browser_item(root, name, max_depth=MAX_SEARCH_DEPTH):
    """Breitensuche nach einem ladbaren Eintrag; flachere Treffer (das Device selbst) vor Presets."""
    wanted = name.strip().lower()
    level = list(getattr(root, "children", []))
    depth = 1
    while level and depth <= max_depth:
        next_level = []
        for item in level:
            item_name = str(item.name)
            base = item_name.rsplit(".", 1)[0] if item_name.lower().endswith((".adv", ".adg", ".amxd")) else item_name
            if getattr(item, "is_loadable", False) and base.strip().lower() == wanted:
                return item
            next_level.extend(getattr(item, "children", []))
        level = next_level
        depth += 1
    return None


class CommandHandler(object):
    def __init__(self, get_song, get_application, log=None):
        self._get_song = get_song
        self._get_application = get_application
        self._log = log or (lambda msg: None)

    def handle(self, msg):
        if not isinstance(msg, dict):
            return {"ok": False, "error": "Nachricht muss ein JSON-Objekt sein"}
        reply = {"id": msg.get("id")}
        cmd = msg.get("cmd")
        handler = getattr(self, "cmd_" + str(cmd), None)
        if handler is None:
            reply.update(ok=False, error="Unbekannter Befehl: %s" % cmd)
            return reply
        try:
            result = handler(msg) or {}
            reply.update(result)
            reply["ok"] = True
        except CommandError as exc:
            reply.update(ok=False, error=str(exc))
        except Exception as exc:  # Live-Fehler (z. B. RuntimeError) an das Device melden statt abzustuerzen
            self._log("ReferenceRebuilder: Fehler bei %s: %r" % (cmd, exc))
            reply.update(ok=False, error="%s: %s" % (type(exc).__name__, exc))
        return reply

    def _track(self, msg):
        song = self._get_song()
        tracks = list(song.tracks)
        try:
            index = int(msg.get("track_index"))
        except (TypeError, ValueError):
            raise CommandError("track_index fehlt oder ist ungueltig")
        if index < 0 or index >= len(tracks):
            raise CommandError("Spur %d existiert nicht (%d Spuren)" % (index, len(tracks)))
        return song, tracks[index]

    def cmd_ping(self, msg):
        app = self._get_application()
        version = "%s.%s.%s" % (app.get_major_version(), app.get_minor_version(), app.get_bugfix_version())
        return {"version": VERSION, "live_version": version}

    def cmd_list_devices(self, msg):
        _, track = self._track(msg)
        return {"devices": [{"name": d.name, "class_name": d.class_name} for d in track.devices]}

    def cmd_load_device(self, msg):
        name = msg.get("device")
        if not name or not isinstance(name, str):
            raise CommandError("device fehlt")
        category = msg.get("category", "audio_effects")
        if category not in BROWSER_CATEGORIES:
            raise CommandError("Unbekannte Browser-Kategorie: %s" % category)
        song, track = self._track(msg)
        browser = self._get_application().browser
        item = find_browser_item(getattr(browser, category), name)
        if item is None:
            raise CommandError("'%s' nicht im Browser (%s) gefunden" % (name, category))

        devices_before = len(track.devices)
        # load_item laedt auf die ausgewaehlte Spur, hinter das ausgewaehlte Device -> letztes auswaehlen.
        song.view.selected_track = track
        if devices_before:
            song.view.select_device(track.devices[-1])
        browser.load_item(item)
        self._log("ReferenceRebuilder: %s auf '%s' geladen" % (item.name, track.name))
        return {"device": str(item.name), "track": str(track.name), "devices_before": devices_before}
