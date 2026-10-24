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
//   set_locator {time, name}               -> {created}
//   create_scene                           -> {scene_index}
//   delete_scene {scene_index}
//   create_clip {track, scene, length, name, color_index}
//   delete_clip {track, scene}
//   get_params {track, device}             -> {params:[{index,name,min,max,is_quantized}]}
//   sample_param {track, device, param, count} -> {samples:[[wert, anzeige]]}
//   write_envelope {track, scene, device, param, steps:[[zeit, dauer, wert]]} -> {steps_written}
//   duplicate_to_arrangement {track, scene, time}

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

function api(path) {
	var a = new LiveAPI(path);
	if (!a || Number(a.id) === 0) {
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

// LiveAPI.call liefert Objekte als ["id", n] (oder "id n").
function idFrom(ret) {
	if (ret && typeof ret === "object" && ret.length !== undefined) {
		for (var i = 0; i < ret.length - 1; i++) {
			if (ret[i] === "id") {
				return Number(ret[i + 1]);
			}
		}
		return Number(ret[ret.length - 1]) || 0;
	}
	if (typeof ret === "string") {
		var m = ret.match(/id\s+(\d+)/);
		return m ? Number(m[1]) : (Number(ret) || 0);
	}
	return Number(ret) || 0;
}

function trackPath(t) {
	return "live_set tracks " + Number(t);
}

function slotPath(t, s) {
	return trackPath(t) + " clip_slots " + Number(s);
}

function paramPath(t, d, p) {
	return trackPath(t) + " devices " + Number(d) + " parameters " + Number(p);
}

function findCue(song, time) {
	var n = song.getcount("cue_points");
	for (var i = 0; i < n; i++) {
		var c = api("live_set cue_points " + i);
		if (Math.abs(num(c, "time") - time) < 0.01) {
			return i;
		}
	}
	return -1;
}

var HANDLERS = {
	ping: function () {
		var app = api("live_app");
		return { live_version: [first(app.call("get_major_version")), first(app.call("get_minor_version")), first(app.call("get_bugfix_version"))].join(".") };
	},

	get_state: function () {
		var song = api("live_set");
		var tracks = [];
		var nt = song.getcount("tracks");
		for (var i = 0; i < nt; i++) {
			var t = api(trackPath(i));
			var devices = [];
			var nd = t.getcount("devices");
			for (var j = 0; j < nd; j++) {
				var d = api(trackPath(i) + " devices " + j);
				devices.push({ index: j, name: str(d, "name"), class_name: str(d, "class_name") });
			}
			tracks.push({
				index: i,
				name: str(t, "name"),
				has_midi_input: num(t, "has_midi_input") === 1,
				is_foldable: num(t, "is_foldable") === 1,
				devices: devices
			});
		}
		var cues = [];
		var nc = song.getcount("cue_points");
		for (var k = 0; k < nc; k++) {
			var c = api("live_set cue_points " + k);
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
		api("live_set").set("tempo", bpm);
		return {};
	},

	// Live 11 hat kein "Locator an Position X anlegen": Song-Position setzen, dann set_or_delete_cue.
	set_locator: function (req) {
		var song = api("live_set");
		var time = Number(req.time);
		var idx = findCue(song, time);
		var created = false;
		if (idx < 0) {
			var previous = num(song, "current_song_time");
			song.set("current_song_time", time);
			song.call("set_or_delete_cue");
			idx = findCue(song, time);
			song.set("current_song_time", previous);
			created = true;
		}
		if (idx < 0) {
			throw new Error("Locator bei Beat " + time + " konnte nicht gesetzt werden");
		}
		api("live_set cue_points " + idx).set("name", String(req.name));
		return { created: created };
	},

	create_scene: function () {
		var song = api("live_set");
		song.call("create_scene", -1);
		return { scene_index: song.getcount("scenes") - 1 };
	},

	delete_scene: function (req) {
		api("live_set").call("delete_scene", Number(req.scene_index));
		return {};
	},

	create_clip: function (req) {
		var slot = api(slotPath(req.track, req.scene));
		if (num(slot, "has_clip") === 1) {
			throw new Error("Clip-Slot ist belegt");
		}
		slot.call("create_clip", Number(req.length));
		var clip = api(slotPath(req.track, req.scene) + " clip");
		clip.set("name", String(req.name));
		if (req.color_index !== null && req.color_index !== undefined) {
			clip.set("color_index", Number(req.color_index));
		}
		return {};
	},

	delete_clip: function (req) {
		api(slotPath(req.track, req.scene)).call("delete_clip");
		return {};
	},

	get_params: function (req) {
		var base = trackPath(req.track) + " devices " + Number(req.device);
		var dev = api(base);
		var params = [];
		var n = dev.getcount("parameters");
		for (var i = 0; i < n; i++) {
			var p = api(base + " parameters " + i);
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
		var p = api(paramPath(req.track, req.device, req.param));
		var min = num(p, "min");
		var max = num(p, "max");
		var count = Math.max(2, Number(req.count) || 64);
		var samples = [];
		for (var i = 0; i < count; i++) {
			var v = min + (max - min) * i / (count - 1);
			samples.push([v, text(p.call("str_for_value", v))]);
		}
		return { samples: samples };
	},

	write_envelope: function (req) {
		var clip = api(slotPath(req.track, req.scene) + " clip");
		var param = api(paramPath(req.track, req.device, req.param));
		var pid = Number(param.id);
		var envId = idFrom(clip.call("automation_envelope", "id", pid));
		if (!envId) {
			envId = idFrom(clip.call("create_automation_envelope", "id", pid));
		}
		if (!envId) {
			envId = idFrom(clip.call("automation_envelope", "id", pid));
		}
		if (!envId) {
			throw new Error("Automation-Envelope konnte nicht angelegt werden");
		}
		var env = new LiveAPI("id " + envId);
		var min = num(param, "min");
		var max = num(param, "max");
		var steps = req.steps || [];
		for (var i = 0; i < steps.length; i++) {
			var v = Math.max(min, Math.min(max, Number(steps[i][2])));
			env.call("insert_step", Number(steps[i][0]), Number(steps[i][1]), v);
		}
		return { steps_written: steps.length };
	},

	duplicate_to_arrangement: function (req) {
		var clip = api(slotPath(req.track, req.scene) + " clip");
		api(trackPath(req.track)).call("duplicate_clip_to_arrangement", "id", Number(clip.id), Number(req.time));
		return {};
	}
};
