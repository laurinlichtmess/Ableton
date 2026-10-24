// [js live_bridge.js] - fuehrt einzelne Live-API-Operationen (LOM, Live 11) aus.
// Klassisches Max-JavaScript (ES5): kein let/const, keine Arrow-Functions, keine Template-Strings.
//
// Eingang:  lom <json>   mit {req, op, ...}
// Ausgang:  lom_result <json>  mit {req, ok, result | error}
//
// Operationen:
//   ping                                   -> {live_version}
//   get_state                              -> {tempo, signature_numerator, signature_denominator, scene_count,
//                                              tracks:[{index,name,has_midi_input,is_foldable,devices:[{index,name,class_name}]}],
//                                              cue_points:[{time,name}]}
//   set_tempo {tempo}
//   set_locator {time, name}               -> {created, name_ok}
//   create_scene                           -> {scene_index}
//   delete_scene {scene_index}
//   create_clip {track, scene, length, name, color_index}
//   delete_clip {track, scene}
//   get_params {track, device}             -> {params:[{index,name,min,max,is_quantized}]}
//   sample_param {track, device, param, count} -> {samples:[[wert, anzeige]]}
//   duplicate_to_arrangement {track, scene, time}
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
				devices: []
			};
			var nd = t.getcount("devices");
			for (var j = 0; j < nd; j++) {
				var d = api(trackPath(i) + " devices " + j, "device");
				info.devices.push({ index: j, name: str(d, "name"), class_name: str(d, "class_name") });
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
		var name = String(req.name);
		var cue = api("live_set cue_points " + idx, "cue");
		cue.set("name", name);
		return { created: created, name_ok: str(cue, "name") === name };
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
		clip.set("name", String(req.name));
		if (req.color_index !== null && req.color_index !== undefined) {
			clip.set("color_index", liveIndex(req.color_index, "color_index"));
		}
		return {};
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
	}
};
