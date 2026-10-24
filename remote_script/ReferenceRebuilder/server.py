# Nicht-blockierender UDP-Server. poll() wird aus update_display() im Live-Hauptthread aufgerufen,
# daher laufen alle Befehle dort, wo die Live-API sie erlaubt (keine eigenen Threads).

import errno
import json
import socket

HOST = "127.0.0.1"
PORT = 47822  # Engine nutzt 47821
MAX_PACKET = 65507


class UdpServer(object):
    def __init__(self, handler, host=HOST, port=PORT, log=None):
        self._handler = handler
        self._host = host
        self._port = port
        self._log = log or (lambda msg: None)
        self._sock = None

    @property
    def port(self):
        return self._sock.getsockname()[1] if self._sock else None

    def start(self):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setblocking(False)
            sock.bind((self._host, self._port))
        except (OSError, socket.error) as exc:
            self._log("ReferenceRebuilder: UDP %s:%s nicht verfuegbar: %s" % (self._host, self._port, exc))
            self._sock = None
            return False
        self._sock = sock
        return True

    def poll(self, max_messages=16):
        if self._sock is None:
            return 0
        handled = 0
        while handled < max_messages:
            try:
                data, addr = self._sock.recvfrom(MAX_PACKET)
            except (OSError, socket.error) as exc:
                if getattr(exc, "errno", None) in (errno.EAGAIN, errno.EWOULDBLOCK) or isinstance(exc, BlockingIOError):
                    break
                self._log("ReferenceRebuilder: recv-Fehler %s" % exc)
                break
            handled += 1
            try:
                msg = json.loads(data.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                reply = {"ok": False, "error": "Ungueltiges JSON"}
            else:
                reply = self._handler(msg)
            try:
                self._sock.sendto(json.dumps(reply).encode("utf-8"), addr)
            except (OSError, socket.error) as exc:
                self._log("ReferenceRebuilder: send-Fehler %s" % exc)
        return handled

    def close(self):
        if self._sock is not None:
            try:
                self._sock.close()
            finally:
                self._sock = None
