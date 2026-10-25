# Befehle des Loop-Sketch Remote Scripts. Keine Live-Imports.
# Python 3.7 (Live 11).

VERSION = "0.1.0"


class CommandError(Exception):
    pass


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
        except Exception as exc:
            self._log("LoopSketch: Fehler bei %s: %r" % (cmd, exc))
            reply.update(ok=False, error="%s: %s" % (type(exc).__name__, exc))
        return reply

    def cmd_ping(self, msg):
        app = self._get_application()
        version = "%s.%s.%s" % (
            app.get_major_version(),
            app.get_minor_version(),
            app.get_bugfix_version(),
        )
        return {"version": VERSION, "live_version": version, "product": "LoopSketch"}
