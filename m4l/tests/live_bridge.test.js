"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var FakeLive = require("./fake_lom").FakeLive;

function setup() {
  var live = new FakeLive();
  live.addScene();
  live.addScene();
  var drums = live.addTrack("Kick Drums", true);
  live.addTrack("Vocals Audio", false);
  live.addTrack("Group", false, { group: true });
  drums.devices.push(live.makeDevice("Auto Filter"));
  return { live: live, bridge: live.loadBridge() };
}

test("live_bridge.js ist klassisches ES5 (Max [js])", function () {
  var src = fs.readFileSync(path.join(__dirname, "..", "js", "live_bridge.js"), "utf8")
    .replace(/\/\/.*$/gm, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  [/\blet\s/, /\bconst\s/, /=>/, /`/, /\bclass\s/, /\.\.\./, /\basync\b/, /\bawait\b/].forEach(function (re) {
    assert.ok(!re.test(src), "ES6-Syntax gefunden: " + re);
  });
});

test("get_state liest Spuren, Geraete und Locators", function () {
  var s = setup();
  var state = s.bridge.raw({ req: 1, op: "get_state" });
  assert.equal(state.ok, true);
  assert.equal(state.req, 1);
  var r = state.result;
  assert.equal(r.tempo, 120);
  assert.equal(r.scene_count, 2);
  assert.equal(r.tracks[0].name, "Kick Drums", "Namen mit Leerzeichen werden zusammengefuegt");
  assert.equal(r.tracks[0].has_midi_input, true);
  assert.equal(r.tracks[1].has_midi_input, false);
  assert.equal(r.tracks[2].is_foldable, true);
  assert.deepEqual(r.tracks[0].devices[0], { index: 0, name: "Auto Filter", class_name: "AutoFilter" });
  assert.equal(s.bridge.raw({ op: "ping" }).result.live_version, "11.3.25");
});

test("set_locator legt an, benennt und stellt Song-Position wieder her", function () {
  var s = setup();
  s.live.song.current_song_time = 5;
  var r = s.bridge.raw({ op: "set_locator", time: 32, name: "Drop 1" });
  assert.deepEqual(r.result, { created: true });
  assert.deepEqual(s.live.song.cue_points.map(function (c) { return [c.time, c.name]; }), [[32, "Drop 1"]]);
  assert.equal(s.live.song.current_song_time, 5);
  // Zweiter Aufruf an gleicher Stelle loescht nicht (set_or_delete_cue wuerde togglen), sondern benennt um.
  r = s.bridge.raw({ op: "set_locator", time: 32, name: "Drop" });
  assert.deepEqual(r.result, { created: false });
  assert.equal(s.live.song.cue_points.length, 1);
  assert.equal(s.live.song.cue_points[0].name, "Drop");
});

test("set_tempo validiert", function () {
  var s = setup();
  assert.equal(s.bridge.raw({ op: "set_tempo", tempo: 128 }).ok, true);
  assert.equal(s.live.song.tempo, 128);
  assert.equal(s.bridge.raw({ op: "set_tempo", tempo: "x" }).ok, false);
});

test("Clip anlegen, Envelope schreiben, ins Arrangement kopieren, aufraeumen", function () {
  var s = setup();
  var b = s.bridge;
  var scene = b.raw({ op: "create_scene" }).result.scene_index;
  assert.equal(scene, 2);
  assert.equal(b.raw({ op: "create_clip", track: 0, scene: scene, length: 32, name: "Build", color_index: 14 }).ok, true);
  var params = b.raw({ op: "get_params", track: 0, device: 0 }).result.params;
  assert.equal(params[2].name, "Frequency");
  var samples = b.raw({ op: "sample_param", track: 0, device: 0, param: 2, count: 8 }).result.samples;
  assert.equal(samples.length, 8);
  assert.equal(samples[0][1], "26.0 Hz");
  assert.equal(samples[7][1], "19.90 kHz");
  var w = b.raw({ op: "write_envelope", track: 0, scene: scene, device: 0, param: 2, steps: [[0, 16, 0.2], [16, 16, 2.5]] });
  assert.deepEqual(w.result, { steps_written: 2 });
  assert.equal(b.raw({ op: "duplicate_to_arrangement", track: 0, scene: scene, time: 32 }).ok, true);
  assert.equal(b.raw({ op: "delete_clip", track: 0, scene: scene }).ok, true);
  assert.equal(b.raw({ op: "delete_scene", scene_index: scene }).ok, true);

  var arr = s.live.song.tracks[0].arrangement_clips;
  assert.equal(arr.length, 1);
  assert.equal(arr[0].start_time, 32);
  assert.equal(arr[0].name, "Build");
  assert.equal(arr[0].color_index, 14);
  var env = arr[0].envelopes[Object.keys(arr[0].envelopes)[0]];
  assert.equal(env.param.name, "Frequency");
  assert.deepEqual(env.steps, [[0, 16, 0.2], [16, 16, 1]], "Werte werden auf max geklemmt");
  assert.equal(s.live.song.scenes.length, 2);
});

test("Fehler werden als ok=false gemeldet (Audiospur, belegter Slot, unbekannte Op, kaputtes JSON)", function () {
  var s = setup();
  var b = s.bridge;
  var e1 = b.raw({ req: 7, op: "create_clip", track: 1, scene: 0, length: 4, name: "x" });
  assert.equal(e1.ok, false);
  assert.equal(e1.req, 7);
  assert.match(e1.error, /MIDI/);
  b.raw({ op: "create_clip", track: 0, scene: 0, length: 4, name: "x" });
  assert.match(b.raw({ op: "create_clip", track: 0, scene: 0, length: 4, name: "y" }).error, /belegt/);
  assert.match(b.raw({ op: "nope" }).error, /Unbekannte Operation/);
  assert.match(b.raw({ op: "get_params", track: 9, device: 0 }).error, /nicht gefunden/);
  s.bridge.sandbox.lom("{kaputt");
  var out = JSON.parse(s.bridge.outputs.pop()[1]);
  assert.equal(out.ok, false);
});
