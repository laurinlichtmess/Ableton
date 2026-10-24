# Companion Remote Script fuer den Reference Rebuilder (Ableton Live 11, Python 3.7).
# Live laedt diesen Ordner aus "~/Music/Ableton/User Library/Remote Scripts/ReferenceRebuilder".


def create_instance(c_instance):
    # Import erst hier, damit commands/server ohne Live importier- und testbar bleiben.
    from .ReferenceRebuilder import ReferenceRebuilder

    return ReferenceRebuilder(c_instance)
