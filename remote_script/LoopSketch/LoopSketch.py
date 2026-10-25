# Control Surface fuer Live 11.
# Einstellungen > Link/Tempo/MIDI > Control Surface "LoopSketch", Eingang/Ausgang "Keine".

from _Framework.ControlSurface import ControlSurface

from .commands import CommandHandler
from .server import PORT, UdpServer


class LoopSketch(ControlSurface):
    def __init__(self, c_instance):
        ControlSurface.__init__(self, c_instance)
        with self.component_guard():
            self._handler = CommandHandler(
                get_song=self.song, get_application=self.application, log=self.log_message
            )
            self._server = UdpServer(self._handler.handle, port=PORT, log=self.log_message)
            if self._server.start():
                self.log_message("LoopSketch: lauscht auf UDP 127.0.0.1:%d" % PORT)
                self.show_message("Loop Sketch bereit (UDP %d)" % PORT)
            else:
                self.show_message("Loop Sketch: Port %d belegt - siehe Log.txt" % PORT)

    def update_display(self):
        ControlSurface.update_display(self)
        self._server.poll()

    def disconnect(self):
        self._server.close()
        ControlSurface.disconnect(self)
