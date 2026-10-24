"use strict";
// Minimales Live-11-Objektmodell fuer Tests von live_bridge.js (nur die genutzten Teile der LOM).
// Verhalten wie in Live: create_clip nur auf MIDI-Spuren, Objekt-Rueckgaben als ["id", n],
// set_or_delete_cue wirkt auf current_song_time.

var fs = require("fs");
var path = require("path");
var vm = require("vm");

function FakeLive() {
  this.registry = {};
  this.nextId = 1;
  this.calls = [];
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
      obj.clip = self.reg({ _type: "Clip", name: "", length: Number(args[0]), color_index: 0, envelopes: {} });
      return undefined;
    }
    case "ClipSlot.delete_clip": obj.clip = null; return undefined;
    case "Clip.automation_envelope": {
      var env = obj.envelopes[args[0]._id];
      return ref(env || null);
    }
    case "Clip.create_automation_envelope": {
      obj.envelopes[args[0]._id] = self.reg({ _type: "AutomationEnvelope", param: args[0], steps: [] });
      return ref(obj.envelopes[args[0]._id]);
    }
    case "AutomationEnvelope.insert_step": obj.steps.push([args[0], args[1], args[2]]); return undefined;
    case "DeviceParameter.str_for_value": return obj.show(Number(args[0]));
    case "Track.duplicate_clip_to_arrangement": {
      var clip = args[0];
      var envs = {};
      Object.keys(clip.envelopes).forEach(function (k) {
        envs[k] = { param: clip.envelopes[k].param, steps: clip.envelopes[k].steps.slice() };
      });
      obj.arrangement_clips.push({ name: clip.name, start_time: Number(args[1]), length: clip.length,
        color_index: clip.color_index, envelopes: envs });
      return undefined;
    }
    default: throw new Error("FakeLive: unbekannte Funktion " + obj._type + "." + fn);
  }
};

FakeLive.prototype.LiveAPIClass = function () {
  var live = this;
  function LiveAPI(p) {
    var obj = live.resolve(p);
    this._obj = obj;
    this.id = obj ? String(obj._id) : "0";
    this.path = p;
  }
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
    if (this._obj[prop] === undefined) throw new Error("FakeLive: unbekannte Eigenschaft " + prop);
    live.calls.push([this._obj._type, "set", prop, value]);
    this._obj[prop] = value;
  };
  LiveAPI.prototype.getcount = function (child) {
    return (this._obj[child] || []).length;
  };
  LiveAPI.prototype.call = function () {
    var args = Array.prototype.slice.call(arguments);
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
    post: function () {},
    arrayfromargs: function (a) { return Array.prototype.slice.call(a); },
    JSON: JSON, Math: Math, String: String, Number: Number, Error: Error, Array: Array,
  };
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(__dirname, "..", "js", "live_bridge.js"), "utf8");
  vm.runInContext(src, sandbox, { filename: "live_bridge.js" });
  var bridge = {
    sandbox: sandbox,
    outputs: outputs,
    raw: function (op) {
      sandbox.lom(JSON.stringify(op));
      var out = outputs.pop();
      if (out[0] !== "lom_result") throw new Error("unerwartete Ausgabe " + out[0]);
      return JSON.parse(out[1]);
    },
  };
  bridge.lom = function (op) {
    var res = bridge.raw(op);
    return res.ok ? Promise.resolve(res.result) : Promise.reject(new Error(res.error));
  };
  return bridge;
};

module.exports = { FakeLive: FakeLive };
