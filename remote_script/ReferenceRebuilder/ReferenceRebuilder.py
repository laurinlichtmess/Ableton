# Control Surface fuer Live 11. Aktivieren: Einstellungen > Link/Tempo/MIDI > Control Surface "ReferenceRebuilder",
# Eingang/Ausgang "Keine".

from _Framework.ControlSurface import ControlSurface

from .commands import CommandHandler
from .server import PORT, UdpServer


class ReferenceRebuilder(ControlSurface):
    def __init__(self, c_instance):
        ControlSurface.__init__(self, c_instance)
        with self.component_guard():
            self._handler = CommandHandler(get_song=self.song, get_application=self.application,
                                           log=self.log_message)
            self._server = UdpServer(self._handler.handle, port=PORT, log=self.log_message)
            if self._server.start():
                self.log_message("ReferenceRebuilder: lauscht auf UDP 127.0.0.1:%d" % PORT)
                self.show_message("Reference Rebuilder bereit (UDP %d)" % PORT)
            else:
                self.show_message("Reference Rebuilder: Port %d belegt - siehe Log.txt" % PORT)

    def update_display(self):
        ControlSurface.update_display(self)
        self._server.poll()

    def disconnect(self):
        self._server.close()
        ControlSurface.disconnect(self)
