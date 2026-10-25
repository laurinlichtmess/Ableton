// [js live_bridge.js] - fuehrt einzelne Live-API-Operationen (LOM, Live 11) aus.
// Klassisches Max-JavaScript (ES5): kein let/const, keine Arrow-Functions, keine Template-Strings.
//
// Eingang:  lom <json>   mit {req, op, ...}
// Ausgang:  lom_result <json>  mit {req, ok, result | error}
//
// Operationen:
//   ping                                   -> {live_version}
//   get_state                              -> {tempo, signature_numerator, signature_denominator, scene_count,
//                                              tracks:[{index,name,has_midi_input,is_foldable,devices,source_loop}],
//                                              cue_points:[{time,name}]}
//                                              source_loop: erster Session- oder Arrangement-Loop (~8 Takte) oder null
//   set_tempo {tempo}
//   set_locator {time, name}               -> {created, name_ok}
//   create_scene                           -> {scene_index}
//   delete_scene {scene_index}
//   create_clip {track, scene, length, name, color_index}   (Hilfs-Pfad; Apply nutzt place_loop)
//   delete_clip {track, scene}
//   copy_clip_to_slot {track, source_kind, source_index, dest_scene}
//     Session: duplicate_clip_to. Arrangement-MIDI: create_clip + Noten kopieren (fuer Automation).
//   stretch_arrangement_clip {track, time, length, color_index, name}
//   get_params {track, device}             -> {params:[{index,name,min,max,is_quantized}]}
//   sample_param {track, device, param, count} -> {samples:[[wert, anzeige]]}
//   duplicate_to_arrangement {track, scene, time}
//   place_loop {track, source_kind, source_index, time, length, name, color_index}
//     -> Quell-Loop (Session/Arrangement) nach Arrangement duplizieren, auf Abschnittslaenge loopen
//
// Clip-Envelopes schreibt das Remote Script (write_envelope): Clip.automation_envelope ist in Live 11
// fuer Max for Live nicht freigegeben.

autowatch = 1;
inlets = 1;
outlets = 1;

function reply(obj) {
	outlet(0, "lom_result", JSON.stringify(obj));
}

function lom() {
	var text = arrayfromargs(arguments).join(" ");
	var req = null;
	try {
		req = JSON.parse(text);
	} catch (e) {
		reply({ req: null, ok: false, error: "Ungueltiges JSON: " + e });
		return;
	}
	try {
		var handler = HANDLERS[req.op];
		if (!handler) {
			throw new Error("Unbekannte Operation: " + req.op);
		}
		reply({ req: req.req, ok: true, result: handler(req) || {} });
	} catch (err) {
		reply({ req: req.req, ok: false, error: String(err && err.message ? err.message : err) });
	}
}

// Feste LiveAPI-Objekte je Rolle, per .path umgesetzt. Jedes "new LiveAPI" haengt in Live einen
// Path-Listener an; nicht mehr referenzierte Objekte erzeugen bei jeder Set-Aenderung
// "SendMessage"-Fehler und "Invalid syntax" in Log.txt.
var cursors = {};

function api(path, role) {
	var key = role || "main";
	var a = cursors[key];
	if (!a) {
		a = new LiveAPI(path);
		cursors[key] = a;
	} else {
		a.path = path;
	}
	if (Number(a.id) === 0) {
		throw new Error("LOM-Objekt nicht gefunden: " + path);
	}
	return a;
}

function first(v) {
	return (v && typeof v === "object" && v.length !== undefined) ? v[0] : v;
}

function num(a, prop) {
	return Number(first(a.get(prop)));
}

function text(v) {
	if (v && typeof v === "object" && v.length !== undefined) {
		return Array.prototype.join.call(v, " ");
	}
	return String(v);
}

function str(a, prop) {
	return text(a.get(prop));
}

// MxDCore parst Zahlen aus Text: "1e-05" wird dort zum String und set/call scheitern mit
// "Invalid syntax". Deshalb nie Exponentialschreibweise an Live schicken.
function liveNum(x, what) {
	var n = Number(x);
	if (!isFinite(n)) {
		throw new Error("Ungueltige Zahl fuer " + (what || "Live") + ": " + x);
	}
	n = Math.round(n * 10000) / 10000;
	return Math.abs(n) < 0.0001 ? 0 : n;
}

function trackPath(t) {
	return "live_set tracks " + liveIndex(t, "track");
}

function slotPath(t, s) {
	return trackPath(t) + " clip_slots " + liveIndex(s, "scene");
}

function paramPath(t, d, p) {
	return trackPath(t) + " devices " + liveIndex(d, "device") + " parameters " + liveIndex(p, "param");
}

function liveIndex(i, what) {
	var n = Number(i);
	if (!(n >= 0) || Math.floor(n) !== n) {
		throw new Error("Ungueltiger Index fuer " + what + ": " + i);
	}
	return n;
}

// Namen mit Leerzeichen: MxDCore kann "Drop 1" als zwei Atome lesen und "Invalid syntax"
// loggen. Ein zusammenhaengender String ohne Leerzeichen ist der sichere Fallback.
function setLiveName(obj, name) {
	var wanted = String(name == null ? "" : name);
	try {
		obj.set("name", wanted);
		if (str(obj, "name") === wanted) {
			return { name: wanted, name_ok: true };
		}
	} catch (e1) { /* Fallback unten */ }
	var safe = wanted.replace(/\s+/g, "_");
	obj.set("name", safe);
	return { name: safe, name_ok: str(obj, "name") === safe };
}

function findCue(song, time) {
	var n = song.getcount("cue_points");
	for (var i = 0; i < n; i++) {
		var c = api("live_set cue_points " + i, "cue");
		if (Math.abs(num(c, "time") - time) < 0.01) {
			return i;
		}
	}
	return -1;
}

function parseNotesRaw(raw) {
	var notes = [];
	if (raw == null) {
		return notes;
	}
	if (typeof raw === "object" && raw.length !== undefined) {
		var i = 0;
		if (String(raw[0]) === "notes") {
			i = 1;
		}
		for (; i + 4 < raw.length; i += 5) {
			notes.push({
				pitch: Number(raw[i]),
				time: Number(raw[i + 1]),
				duration: Number(raw[i + 2]),
				velocity: Number(raw[i + 3]),
				mute: Number(raw[i + 4]) ? 1 : 0
			});
		}
	}
	return notes;
}

function clipNoteCount(clip) {
	try {
		if (num(clip, "is_midi_clip") !== 1) {
			return -1; // Audio: Inhalt vorhanden
		}
		return parseNotesRaw(clip.call("get_notes", 0, 0, 100000, 128)).length;
	} catch (e) {
		return 0;
	}
}

// MIDI-Noten von Quellclip in Zielclip (Live 11: set_notes / notes / note / done).
function copyMidiNotes(srcClip, destClip) {
	var notes = parseNotesRaw(srcClip.call("get_notes", 0, 0, 100000, 128));
	if (!notes.length) {
		throw new Error("Quell-Loop hat keine MIDI-Noten");
	}
	try {
		destClip.call("select_all_notes");
		destClip.call("replace_selected_notes");
	} catch (e0) {
		try {
			destClip.call("set_notes");
		} catch (e1) { /* set_notes startet den Schreibmodus */ }
	}
	destClip.call("notes", liveIndex(notes.length, "notes"));
	for (var i = 0; i < notes.length; i++) {
		var n = notes[i];
		destClip.call(
			"note",
			liveIndex(n.pitch, "pitch"),
			liveNum(n.time, "time"),
			liveNum(n.duration, "duration"),
			liveIndex(n.velocity, "velocity"),
			liveIndex(n.mute, "mute")
		);
	}
	destClip.call("done");
	if (clipNoteCount(destClip) === 0) {
		throw new Error("Noten konnten nicht in Hilfsclip geschrieben werden");
	}
	return notes.length;
}

function clipLoopInfo(clip, kind, index) {
	var name = str(clip, "name");
	if (/eingefroren/i.test(name)) {
		return null;
	}
	var looping = num(clip, "looping") === 1;
	var loopStart = num(clip, "loop_start");
	var loopEnd = num(clip, "loop_end");
	var length = looping ? (loopEnd - loopStart) : num(clip, "length");
	if (!(length > 0.05) || !isFinite(length)) {
		return null;
	}
	var startTime = 0;
	if (kind === "arrangement") {
		startTime = num(clip, "start_time");
		if (startTime > 64) {
			return null;
		}
	}
	var notes = clipNoteCount(clip);
	// MIDI ohne Noten ist als Quell-Loop unbrauchbar (waere wieder ein leerer Clip).
	if (notes === 0) {
		return null;
	}
	var score = 10;
	if (length >= 4 && length <= 64) {
		score += 5;
	}
	if (length >= 16 && length <= 32) {
		score += 3;
	}
	if (kind === "session") {
		score += 20;
	}
	if (kind === "arrangement" && startTime <= 0.1) {
		score += 5;
	}
	if (notes > 0) {
		score += Math.min(notes, 10);
	}
	return {
		kind: kind,
		index: index,
		length: liveNum(length, "length"),
		color_index: Math.floor(num(clip, "color_index")),
		name: name,
		looping: looping,
		loop_start: liveNum(loopStart, "loop_start"),
		loop_end: liveNum(loopEnd, "loop_end"),
		start_time: liveNum(startTime, "start_time"),
		note_count: notes,
		score: score
	};
}

// Erster brauchbarer Loop: Session-Slots von vorne, sonst Arrangement-Clips nahe Beat 0.
function findSourceLoop(trackIndex) {
	var best = null;
	var t = api(trackPath(trackIndex), "track");
	var nSlots = t.getcount("clip_slots");
	var maxSlots = Math.min(nSlots, 32);
	for (var i = 0; i < maxSlots; i++) {
		var slot = api(slotPath(trackIndex, i), "slot");
		if (num(slot, "has_clip") !== 1) {
			continue;
		}
		var clip = api(slotPath(trackIndex, i) + " clip", "clip");
		var info = clipLoopInfo(clip, "session", i);
		if (!info) {
			continue;
		}
		if (!best || info.score > best.score) {
			best = info;
		}
		if (i === 0 && info.score >= 15) {
			break;
		}
	}
	if (best && best.kind === "session") {
		return best;
	}
	var nArr = t.getcount("arrangement_clips");
	for (var j = 0; j < nArr; j++) {
		var aclip = api(trackPath(trackIndex) + " arrangement_clips " + j, "aclip");
		var info2 = clipLoopInfo(aclip, "arrangement", j);
		if (!info2) {
			continue;
		}
		if (!best || info2.score > best.score ||
			(best.kind === "arrangement" && info2.start_time < best.start_time && info2.score >= best.score - 2)) {
			best = info2;
		}
	}
	return best;
}

function sourceClipApi(trackIndex, kind, index) {
	if (kind === "session") {
		return api(slotPath(trackIndex, index) + " clip", "clip");
	}
	return api(trackPath(trackIndex) + " arrangement_clips " + liveIndex(index, "arrangement"), "aclip");
}

function findArrangementClipAt(trackIndex, time) {
	var t = api(trackPath(trackIndex), "track");
	var n = t.getcount("arrangement_clips");
	var best = -1;
	var bestDelta = 1e9;
	for (var i = 0; i < n; i++) {
		var c = api(trackPath(trackIndex) + " arrangement_clips " + i, "aclip");
		var delta = Math.abs(num(c, "start_time") - time);
		if (delta < bestDelta) {
			bestDelta = delta;
			best = i;
		}
	}
	if (best < 0 || bestDelta > 0.05) {
		return null;
	}
	return api(trackPath(trackIndex) + " arrangement_clips " + best, "aclip");
}

// Loop-Klammer beibehalten, Clip auf Abschnittslaenge bringen (Noten bleiben, werden geloopt).
function stretchClipToLength(clip, length, opts) {
	opts = opts || {};
	var loopStart = num(clip, "loop_start");
	var loopEnd = num(clip, "loop_end");
	var looping = num(clip, "looping") === 1;
	var sourceLen = looping ? (loopEnd - loopStart) : num(clip, "length");
	if (!(sourceLen > 0.05)) {
		sourceLen = length;
	}
	clip.set("looping", 1);
	if (looping) {
		clip.set("loop_start", liveNum(loopStart, "loop_start"));
		clip.set("loop_end", liveNum(loopEnd, "loop_end"));
	} else {
		clip.set("loop_start", 0);
		clip.set("loop_end", liveNum(sourceLen, "loop_end"));
	}
	// Session: end_marker = Laenge. Arrangement: end_time absolut.
	if (opts.arrangement && opts.time != null) {
		try {
			clip.set("end_time", liveNum(opts.time + length, "end_time"));
		} catch (e1) {
			clip.set("end_marker", liveNum(length, "end_marker"));
		}
	} else {
		clip.set("end_marker", liveNum(length, "end_marker"));
		try {
			clip.set("length", liveNum(length, "length"));
		} catch (e2) { /* end_marker reicht oft */ }
	}
	if (opts.color_index !== null && opts.color_index !== undefined && !isNaN(Number(opts.color_index))) {
		clip.set("color_index", liveIndex(opts.color_index, "color_index"));
	}
	if (opts.name !== null && opts.name !== undefined && String(opts.name).length) {
		setLiveName(clip, opts.name);
	}
}

function stretchArrangementClip(clip, time, length, colorIndex, name) {
	stretchClipToLength(clip, length, { arrangement: true, time: time, color_index: colorIndex, name: name });
}

var HANDLERS = {
	ping: function () {
		var app = api("live_app", "app");
		return { live_version: [first(app.call("get_major_version")), first(app.call("get_minor_version")), first(app.call("get_bugfix_version"))].join(".") };
	},

	get_state: function () {
		var song = api("live_set", "song");
		var tracks = [];
		var nt = song.getcount("tracks");
		for (var i = 0; i < nt; i++) {
			var t = api(trackPath(i), "track");
			var info = {
				index: i,
				name: str(t, "name"),
				has_midi_input: num(t, "has_midi_input") === 1,
				is_foldable: num(t, "is_foldable") === 1,
				devices: [],
				source_loop: null
			};
			var nd = t.getcount("devices");
			for (var j = 0; j < nd; j++) {
				var d = api(trackPath(i) + " devices " + j, "device");
				info.devices.push({ index: j, name: str(d, "name"), class_name: str(d, "class_name") });
			}
			if (!info.is_foldable) {
				var src = findSourceLoop(i);
				if (src) {
					info.source_loop = {
						kind: src.kind,
						index: src.index,
						length: src.length,
						color_index: src.color_index,
						name: src.name,
						looping: src.looping,
						loop_start: src.loop_start,
						loop_end: src.loop_end,
						note_count: src.note_count
					};
				}
			}
			tracks.push(info);
		}
		var cues = [];
		var nc = song.getcount("cue_points");
		for (var k = 0; k < nc; k++) {
			var c = api("live_set cue_points " + k, "cue");
			cues.push({ time: num(c, "time"), name: str(c, "name") });
		}
		return {
			tempo: num(song, "tempo"),
			signature_numerator: num(song, "signature_numerator"),
			signature_denominator: num(song, "signature_denominator"),
			scene_count: song.getcount("scenes"),
			tracks: tracks,
			cue_points: cues
		};
	},

	set_tempo: function (req) {
		var bpm = Number(req.tempo);
		if (!(bpm >= 20 && bpm <= 999)) {
			throw new Error("Ungueltiges Tempo: " + req.tempo);
		}
		api("live_set", "song").set("tempo", liveNum(bpm, "tempo"));
		return {};
	},

	// Live 11 hat kein "Locator an Position X anlegen": Song-Position setzen, dann set_or_delete_cue.
	set_locator: function (req) {
		var song = api("live_set", "song");
		var time = liveNum(req.time, "time");
		if (time < 0) {
			throw new Error("Locator vor Beat 0: " + req.time);
		}
		var idx = findCue(song, time);
		var created = false;
		if (idx < 0) {
			var previous = liveNum(num(song, "current_song_time"), "current_song_time");
			song.set("current_song_time", time);
			song.call("set_or_delete_cue");
			idx = findCue(song, time);
			song.set("current_song_time", previous);
			created = true;
		}
		if (idx < 0) {
			throw new Error("Locator bei Beat " + time + " konnte nicht gesetzt werden");
		}
		var cue = api("live_set cue_points " + idx, "cue");
		var named = setLiveName(cue, req.name);
		return { created: created, name_ok: named.name_ok, name: named.name };
	},

	create_scene: function () {
		var song = api("live_set", "song");
		song.call("create_scene", -1);
		return { scene_index: song.getcount("scenes") - 1 };
	},

	delete_scene: function (req) {
		api("live_set", "song").call("delete_scene", liveIndex(req.scene_index, "scene"));
		return {};
	},

	create_clip: function (req) {
		var slot = api(slotPath(req.track, req.scene), "slot");
		if (num(slot, "has_clip") === 1) {
			throw new Error("Clip-Slot ist belegt");
		}
		var length = liveNum(req.length, "length");
		if (!(length > 0)) {
			throw new Error("Ungueltige Clip-Laenge: " + req.length);
		}
		slot.call("create_clip", length);
		var clip = api(slotPath(req.track, req.scene) + " clip", "clip");
		var named = setLiveName(clip, req.name);
		if (req.color_index !== null && req.color_index !== undefined) {
			clip.set("color_index", liveIndex(req.color_index, "color_index"));
		}
		return { name: named.name, name_ok: named.name_ok };
	},

	delete_clip: function (req) {
		var slot = api(slotPath(req.track, req.scene), "slot");
		if (num(slot, "has_clip") === 1) {
			slot.call("delete_clip");
		}
		return {};
	},

	get_params: function (req) {
		var base = trackPath(req.track) + " devices " + liveIndex(req.device, "device");
		var dev = api(base, "device");
		var params = [];
		var n = dev.getcount("parameters");
		for (var i = 0; i < n; i++) {
			var p = api(base + " parameters " + i, "param");
			params.push({
				index: i,
				name: str(p, "name"),
				min: num(p, "min"),
				max: num(p, "max"),
				is_quantized: num(p, "is_quantized") === 1
			});
		}
		return { params: params };
	},

	sample_param: function (req) {
		var p = api(paramPath(req.track, req.device, req.param), "param");
		var min = num(p, "min");
		var max = num(p, "max");
		var count = Math.max(2, Number(req.count) || 64);
		var samples = [];
		for (var i = 0; i < count; i++) {
			var v = liveNum(min + (max - min) * i / (count - 1), "value");
			samples.push([v, text(p.call("str_for_value", v))]);
		}
		return { samples: samples };
	},

	duplicate_to_arrangement: function (req) {
		var clip = api(slotPath(req.track, req.scene) + " clip", "clip");
		api(trackPath(req.track), "track").call("duplicate_clip_to_arrangement", "id", Number(clip.id), liveNum(req.time, "time"));
		return {};
	},

	// Quell-Loop in Hilfs-Slot (fuer write_envelope). Session: duplicate. Arrangement-MIDI: Noten kopieren.
	copy_clip_to_slot: function (req) {
		var trackIdx = liveIndex(req.track, "track");
		var destScene = liveIndex(req.dest_scene, "dest_scene");
		var kind = req.source_kind === "arrangement" ? "arrangement" : "session";
		var destSlot = api(slotPath(trackIdx, destScene), "destslot");
		if (num(destSlot, "has_clip") === 1) {
			destSlot.call("delete_clip");
		}
		if (kind === "session") {
			var srcSlot = api(slotPath(trackIdx, req.source_index), "slot");
			if (num(srcSlot, "has_clip") !== 1) {
				throw new Error("Quell-Slot ist leer");
			}
			srcSlot.call("duplicate_clip_to", "id", Number(destSlot.id));
		} else {
			var track = api(trackPath(trackIdx), "track");
			if (num(track, "has_midi_input") !== 1) {
				throw new Error("Arrangement-Audio kann nicht in Session-Hilfsclip fuer Automation");
			}
			var source = sourceClipApi(trackIdx, "arrangement", req.source_index);
			var srcLen = num(source, "looping") === 1
				? (num(source, "loop_end") - num(source, "loop_start"))
				: num(source, "length");
			if (!(srcLen > 0)) {
				srcLen = 32;
			}
			destSlot.call("create_clip", liveNum(srcLen, "length"));
			var dest = api(slotPath(trackIdx, destScene) + " clip", "clip");
			copyMidiNotes(source, dest);
			dest.set("color_index", liveIndex(Math.floor(num(source, "color_index")), "color_index"));
			try {
				dest.set("looping", 1);
				dest.set("loop_start", liveNum(num(source, "loop_start"), "loop_start"));
				dest.set("loop_end", liveNum(num(source, "loop_end"), "loop_end"));
			} catch (eLoop) { /* optional */ }
			if (str(source, "name")) {
				setLiveName(dest, str(source, "name"));
			}
		}
		var clip = api(slotPath(trackIdx, destScene) + " clip", "clip");
		return {
			color_index: Math.floor(num(clip, "color_index")),
			length: liveNum(num(clip, "length"), "length"),
			name: str(clip, "name"),
			note_count: clipNoteCount(clip),
			source_kind: kind
		};
	},

	stretch_arrangement_clip: function (req) {
		var time = liveNum(req.time, "time");
		var length = liveNum(req.length, "length");
		if (!(length > 0)) {
			throw new Error("Ungueltige Abschnittslaenge: " + req.length);
		}
		var clip = findArrangementClipAt(req.track, time);
		if (!clip) {
			throw new Error("Kein Arrangement-Clip bei Beat " + time);
		}
		stretchArrangementClip(clip, time, length, req.color_index, req.name);
		return {
			start_time: num(clip, "start_time"),
			color_index: Math.floor(num(clip, "color_index")),
			note_count: clipNoteCount(clip)
		};
	},

	// Session-Hilfsclip auf Abschnittslaenge bringen, bevor Envelopes geschrieben werden.
	stretch_session_clip: function (req) {
		var length = liveNum(req.length, "length");
		if (!(length > 0)) {
			throw new Error("Ungueltige Abschnittslaenge: " + req.length);
		}
		var clip = api(slotPath(req.track, req.scene) + " clip", "clip");
		stretchClipToLength(clip, length, { color_index: req.color_index, name: req.name });
		return { note_count: clipNoteCount(clip), length: length };
	},

	delete_device: function (req) {
		var trackIdx = liveIndex(req.track, "track");
		var track = api(trackPath(trackIdx), "track");
		var n = track.getcount("devices");
		var index = req.device_index;
		if (req.class_name) {
			index = -1;
			for (var i = 0; i < n; i++) {
				var d = api(trackPath(trackIdx) + " devices " + i, "device");
				if (str(d, "class_name") === String(req.class_name)) {
					index = i;
				}
			}
			if (index < 0) {
				return { deleted: false };
			}
		}
		track.call("delete_device", liveIndex(index, "device"));
		return { deleted: true, device_index: index };
	},

	// Quell-Loop (Session oder Arrangement) an section-Zeit legen und auf Abschnittslaenge loopen.
	place_loop: function (req) {
		var trackIdx = liveIndex(req.track, "track");
		var time = liveNum(req.time, "time");
		var length = liveNum(req.length, "length");
		if (!(length > 0)) {
			throw new Error("Ungueltige Abschnittslaenge: " + req.length);
		}
		var kind = req.source_kind === "arrangement" ? "arrangement" : "session";
		var source = sourceClipApi(trackIdx, kind, req.source_index);
		var srcNotes = clipNoteCount(source);
		if (srcNotes === 0) {
			throw new Error("Quell-Loop hat keine MIDI-Noten");
		}
		var color = req.color_index !== null && req.color_index !== undefined
			? liveIndex(req.color_index, "color_index")
			: Math.floor(num(source, "color_index"));
		api(trackPath(trackIdx), "track").call(
			"duplicate_clip_to_arrangement", "id", Number(source.id), time
		);
		var placed = findArrangementClipAt(trackIdx, time);
		if (!placed) {
			throw new Error("Loop konnte nicht ins Arrangement gelegt werden (Beat " + time + ")");
		}
		stretchArrangementClip(placed, time, length, color, req.name);
		var placedNotes = clipNoteCount(placed);
		if (srcNotes > 0 && placedNotes === 0) {
			throw new Error("Noten gingen beim Duplizieren verloren");
		}
		return {
			start_time: num(placed, "start_time"),
			color_index: Math.floor(num(placed, "color_index")),
			source_kind: kind,
			source_index: liveIndex(req.source_index, "source"),
			note_count: placedNotes
		};
	}
};
