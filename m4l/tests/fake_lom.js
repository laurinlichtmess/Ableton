"use strict";
// Minimales Live-11-Objektmodell fuer Tests von live_bridge.js (nur die genutzten Teile der LOM).
// Verhalten wie in Live: create_clip nur auf MIDI-Spuren, Objekt-Rueckgaben als ["id", n],
// set_or_delete_cue wirkt auf current_song_time. Wie Max for Live in Live 11 gibt es keine
// Clip.automation_envelope/create_automation_envelope (nur die Python-API des Remote Scripts hat sie,
// siehe remoteScript()). Zahlen in Exponentialschreibweise lehnt MxDCore mit "Invalid syntax" ab.

var fs = require("fs");
var path = require("path");
var vm = require("vm");

function FakeLive() {
  this.registry = {};
  this.nextId = 1;
  this.calls = [];
  this.apiInstances = 0;
  this.app = this.reg({ _type: "Application", major: 11, minor: 3, bugfix: 25 });
  this.song = this.reg({ _type: "Song", tempo: 120, signature_numerator: 4, signature_denominator: 4,
    current_song_time: 0, tracks: [], cue_points: [], scenes: [] });
}

FakeLive.prototype.reg = function (obj) {
  obj._id = this.nextId++;
  this.registry[obj._id] = obj;
  return obj;
};

FakeLive.prototype.addScene = function () {
  var self = this;
  self.song.scenes.push(self.reg({ _type: "Scene", name: "" }));
  self.song.tracks.forEach(function (t) { t.clip_slots.push(self.reg({ _type: "ClipSlot", _track: t, clip: null })); });
};

FakeLive.prototype.makeClip = function (opts) {
  opts = opts || {};
  var length = opts.length != null ? opts.length : 32;
  return this.reg({
    _type: "Clip",
    name: opts.name != null ? opts.name : "loop",
    length: length,
    color_index: opts.color_index != null ? opts.color_index : 14,
    looping: opts.looping != null ? opts.looping : 1,
    loop_start: opts.loop_start != null ? opts.loop_start : 0,
    loop_end: opts.loop_end != null ? opts.loop_end : length,
    start_time: opts.start_time != null ? opts.start_time : 0,
    end_time: opts.end_time != null ? opts.end_time : (opts.start_time || 0) + length,
    end_marker: opts.end_marker != null ? opts.end_marker : length,
    start_marker: 0,
    notes: opts.notes != null ? opts.notes : [[0, 1, 60, 100]],
    envelopes: opts.envelopes || {},
  });
};

FakeLive.prototype.addTrack = function (name, midi, opts) {
  var self = this;
  var t = self.reg({ _type: "Track", name: name, has_midi_input: midi ? 1 : 0, is_foldable: (opts && opts.group) ? 1 : 0,
    devices: [], clip_slots: [], arrangement_clips: [] });
  self.song.scenes.forEach(function () { t.clip_slots.push(self.reg({ _type: "ClipSlot", _track: t, clip: null })); });
  self.song.tracks.push(t);
  return t;
};

// Auto Filter: Rohwert 0..1, Anzeige 26 Hz .. 19.9 kHz logarithmisch. Utility: Rohwert -1..1 = -35..+35 dB.
function fmtHz(hz) {
  return hz >= 1000 ? (hz / 1000).toFixed(2) + " kHz" : hz.toFixed(1) + " Hz";
}

FakeLive.prototype.makeDevice = function (deviceName) {
  var self = this;
  if (deviceName === "Auto Filter") {
    return self.reg({ _type: "Device", name: "Auto Filter", class_name: "AutoFilter", parameters: [
      self.reg({ _type: "DeviceParameter", name: "Device On", min: 0, max: 1, value: 1, is_quantized: 1, show: String }),
      self.reg({ _type: "DeviceParameter", name: "Filter Type", min: 0, max: 3, value: 0, is_quantized: 1, show: String }),
      self.reg({ _type: "DeviceParameter", name: "Frequency", min: 0, max: 1, value: 1, is_quantized: 0,
        show: function (v) { return fmtHz(26 * Math.pow(19900 / 26, v)); } }),
      self.reg({ _type: "DeviceParameter", name: "Resonance", min: 0, max: 1.25, value: 0, is_quantized: 0, show: String }),
    ] });
  }
  if (deviceName === "Utility") {
    return self.reg({ _type: "Device", name: "Utility", class_name: "StereoGain", parameters: [
      self.reg({ _type: "DeviceParameter", name: "Device On", min: 0, max: 1, value: 1, is_quantized: 1, show: String }),
      self.reg({ _type: "DeviceParameter", name: "Gain", min: -1, max: 1, value: 0, is_quantized: 0,
        show: function (v) { return v <= -0.99 ? "-inf dB" : (v * 35).toFixed(2) + " dB"; } }),
    ] });
  }
  return self.reg({ _type: "Device", name: deviceName, class_name: deviceName.replace(/\s/g, ""), parameters: [] });
};

FakeLive.prototype.resolve = function (p) {
  var tokens = String(p).trim().split(/\s+/);
  if (tokens[0] === "id") return this.registry[Number(tokens[1])] || null;
  var obj;
  if (tokens[0] === "live_set") obj = this.song;
  else if (tokens[0] === "live_app") obj = this.app;
  else return null;
  for (var i = 1; i < tokens.length && obj; i++) {
    var key = tokens[i];
    if (key === "clip") { obj = obj.clip; continue; }
    var list = obj[key];
    var idx = Number(tokens[++i]);
    obj = Array.isArray(list) ? list[idx] || null : null;
  }
  return obj || null;
};

FakeLive.prototype.unpackArgs = function (args) {
  var out = [];
  for (var i = 0; i < args.length; i++) {
    if (args[i] === "id") { out.push(this.registry[Number(args[i + 1])] || null); i++; } else out.push(args[i]);
  }
  return out;
};

function ref(obj) { return ["id", obj ? obj._id : 0]; }

function cloneEnvelopes(clip) {
  var envs = {};
  Object.keys(clip.envelopes || {}).forEach(function (k) {
    envs[k] = { param: clip.envelopes[k].param, steps: clip.envelopes[k].steps.slice() };
  });
  return envs;
}

FakeLive.prototype.copyClip = function (clip, overrides) {
  overrides = overrides || {};
  var length = overrides.length != null ? overrides.length : clip.length;
  return this.reg({
    _type: "Clip",
    name: overrides.name != null ? overrides.name : clip.name,
    length: length,
    color_index: overrides.color_index != null ? overrides.color_index : clip.color_index,
    looping: overrides.looping != null ? overrides.looping : clip.looping,
    loop_start: overrides.loop_start != null ? overrides.loop_start : clip.loop_start,
    loop_end: overrides.loop_end != null ? overrides.loop_end : clip.loop_end,
    start_time: overrides.start_time != null ? overrides.start_time : 0,
    end_time: overrides.end_time != null ? overrides.end_time : (overrides.start_time || 0) + length,
    end_marker: overrides.end_marker != null ? overrides.end_marker : length,
    start_marker: 0,
    notes: (clip.notes || []).map(function (n) { return n.slice(); }),
    envelopes: cloneEnvelopes(clip),
  });
};

FakeLive.prototype.invoke = function (obj, fn, args) {
  var self = this;
  var song = self.song;
  self.calls.push([obj._type, fn].concat(args.map(function (a) { return a && a._id ? "id " + a._id : a; })));
  switch (obj._type + "." + fn) {
    case "Application.get_major_version": return obj.major;
    case "Application.get_minor_version": return obj.minor;
    case "Application.get_bugfix_version": return obj.bugfix;
    case "Song.set_or_delete_cue": {
      var t = song.current_song_time;
      var existing = song.cue_points.findIndex(function (c) { return Math.abs(c.time - t) < 1e-6; });
      if (existing >= 0) song.cue_points.splice(existing, 1);
      else song.cue_points.push(self.reg({ _type: "CuePoint", time: t, name: "" }));
      song.cue_points.sort(function (a, b) { return a.time - b.time; });
      return undefined;
    }
    case "Song.create_scene": self.addScene(); return ref(song.scenes[song.scenes.length - 1]);
    case "Song.delete_scene": {
      var i = Number(args[0]);
      song.scenes.splice(i, 1);
      song.tracks.forEach(function (tr) { tr.clip_slots.splice(i, 1); });
      return undefined;
    }
    case "ClipSlot.create_clip": {
      if (!obj._track.has_midi_input) throw new Error("Can only create clips on MIDI tracks");
      if (obj.clip) throw new Error("Clip slot already has a clip");
      obj.clip = self.makeClip({ name: "", length: Number(args[0]), color_index: 0, notes: [] });
      return undefined;
    }
    case "ClipSlot.delete_clip": obj.clip = null; return undefined;
    case "ClipSlot.duplicate_clip_to": {
      var dest = args[0];
      if (!obj.clip) throw new Error("Quell-Slot ist leer");
      dest.clip = self.copyClip(obj.clip);
      return undefined;
    }
    case "DeviceParameter.str_for_value": return obj.show(Number(args[0]));
    case "Track.duplicate_clip_to_arrangement": {
      var clip = args[0];
      var start = Number(args[1]);
      var loopLen = clip.looping ? (clip.loop_end - clip.loop_start) : clip.length;
      obj.arrangement_clips.push(self.copyClip(clip, {
        start_time: start,
        end_time: start + loopLen,
        length: loopLen,
        end_marker: loopLen,
      }));
      return undefined;
    }
    default: throw new Error("'" + obj._type + "' object has no attribute '" + fn + "'");
  }
};

function checkSyntax(values) {
  values.forEach(function (v) {
    if (typeof v === "number" && /e/i.test(String(v))) throw new Error("Invalid syntax (" + v + ")");
  });
}

// Python-Seite des Remote Scripts (commands.py) auf diesem Modell: load_device und write_envelope.
FakeLive.prototype.remoteScript = function (msg) {
  var track = this.song.tracks[msg.track_index];
  if (!track) throw new Error("Spur " + msg.track_index + " existiert nicht");
  if (msg.cmd === "load_device") {
    track.devices.push(this.makeDevice(msg.device));
    return { ok: true, device: msg.device };
  }
  if (msg.cmd === "write_envelope") {
    var slot = track.clip_slots[msg.scene_index];
    if (!slot || !slot.clip) throw new Error("Kein Clip in Slot " + msg.scene_index);
    var param = track.devices[msg.device_index].parameters[msg.parameter_index];
    var env = slot.clip.envelopes[param._id];
    if (!env) env = slot.clip.envelopes[param._id] = this.reg({ _type: "AutomationEnvelope", param: param, steps: [] });
    msg.steps.forEach(function (st) { env.steps.push([st[0], st[1], Math.min(param.max, Math.max(param.min, st[2]))]); });
    return { ok: true, steps_written: msg.steps.length };
  }
  throw new Error("Unbekannter Befehl: " + msg.cmd);
};

FakeLive.prototype.LiveAPIClass = function () {
  var live = this;
  function LiveAPI(p) {
    live.apiInstances++;
    this._path = "";
    this._obj = null;
    if (p !== undefined) this.path = p;
  }
  Object.defineProperty(LiveAPI.prototype, "path", {
    get: function () { return this._path; },
    set: function (p) { this._path = p; this._obj = live.resolve(p); },
  });
  Object.defineProperty(LiveAPI.prototype, "id", {
    get: function () { return this._obj ? String(this._obj._id) : "0"; },
  });
  LiveAPI.prototype.get = function (prop) {
    var o = this._obj;
    if (prop === "has_clip") return [o.clip ? 1 : 0];
    var v = o[prop];
    if (v === undefined) throw new Error("FakeLive: unbekannte Eigenschaft " + o._type + "." + prop);
    // Wie in Max: Strings mit Leerzeichen kommen als mehrere Atome.
    if (typeof v === "string") return v.split(" ");
    return [v];
  };
  LiveAPI.prototype.set = function (prop, value) {
    checkSyntax([value]);
    if (this._obj[prop] === undefined) throw new Error("FakeLive: unbekannte Eigenschaft " + prop);
    live.calls.push([this._obj._type, "set", prop, value]);
    this._obj[prop] = value;
    if (prop === "end_time" && this._obj.start_time != null) {
      this._obj.length = Number(value) - Number(this._obj.start_time);
      this._obj.end_marker = this._obj.length;
    }
    if (prop === "end_marker") {
      this._obj.length = Number(value);
      if (this._obj.start_time != null) this._obj.end_time = this._obj.start_time + Number(value);
    }
  };
  LiveAPI.prototype.getcount = function (child) {
    return (this._obj[child] || []).length;
  };
  LiveAPI.prototype.call = function () {
    var args = Array.prototype.slice.call(arguments);
    checkSyntax(args.slice(1));
    return live.invoke(this._obj, args[0], live.unpackArgs(args.slice(1)));
  };
  return LiveAPI;
};

// live_bridge.js in einer Max-aehnlichen Umgebung laden. Gibt eine Funktion op -> Promise(result) zurueck.
FakeLive.prototype.loadBridge = function () {
  var live = this;
  var outputs = [];
  var sandbox = {
    LiveAPI: live.LiveAPIClass(),
    // outlet(index, message, ...) wie in Max
    outlet: function () { outputs.push(Array.prototype.slice.call(arguments, 1)); },
    autowatch: 0, inlets: 1, outlets: 1,
    arrayfromargs: function (a) { return Array.prototype.slice.call(a); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "live_bridge.js"), "utf8"), sandbox, {
    filename: "live_bridge.js",
  });
  function raw(op) {
    outputs.length = 0;
    sandbox.lom(typeof op === "string" ? op : JSON.stringify(op));
    if (!outputs.length) throw new Error("live_bridge: keine Antwort");
    return JSON.parse(outputs[0][1]);
  }
  return {
    raw: raw,
    lom: function (op) {
      return Promise.resolve().then(function () {
        var r = raw(Object.assign({ req: 1 }, op));
        if (!r.ok) throw new Error(r.error);
        return r.result;
      });
    },
    outputs: outputs,
    sandbox: sandbox,
  };
};

module.exports = { FakeLive: FakeLive };
