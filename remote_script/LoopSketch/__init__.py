# Companion Remote Script fuer Loop Sketch (Ableton Live 11, Python 3.7).
# Live laedt diesen Ordner aus "~/Music/Ableton/User Library/Remote Scripts/LoopSketch".
# To Arr nutzt primaer die Max-for-Live LiveAPI (place_loop); dieses Script ist fuer
# Ping/Status und spaetere Erweiterungen.


def create_instance(c_instance):
    from .LoopSketch import LoopSketch

    return LoopSketch(c_instance)
