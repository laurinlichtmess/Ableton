"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var core = require("../js/rr_core");
var analysis = require("./fixtures/analysis.json");

var TRACKS = [
  { index: 0, name: "Kick & Drums", has_midi_input: true, is_foldable: false, devices: [] },
  { index: 1, name: "Sub Bass", has_midi_input: true, is_foldable: false, devices: [] },
  { index: 2, name: "Synths", has_midi_input: true, is_foldable: true, devices: [] },
  { index: 3, name: "Lead Synth", has_midi_input: true, is_foldable: false, devices: [{ index: 0, name: "Auto Filter", class_name: "AutoFilter" }] },
  { index: 4, name: "Lead Vox", has_midi_input: false, is_foldable: false, devices: [] },
];

test("toPosixPath wandelt Max-Pfade um", function () {
  assert.equal(core.toPosixPath("Macintosh HD:/Users/me/a b.mp3"), "/Users/me/a b.mp3");
  assert.equal(core.toPosixPath("/Users/me/a.mp3"), "/Users/me/a.mp3");
  var exists = function (p) { return p === "/Volumes/Samples/x.mp3"; };
  assert.equal(core.toPosixPath("Samples:/x.mp3", exists), "/Volumes/Samples/x.mp3");
});

test("autoMapStems ordnet nach Namen zu, Gruppen werden ignoriert, Spuren nur einmal", function () {
  var m = core.autoMapStems(["drums", "bass", "other", "vocals"], TRACKS);
  assert.deepEqual(m, { drums: 0, bass: 1, other: 3, vocals: 4 });
  var m2 = core.autoMapStems(["drums", "bass"], [{ index: 0, name: "Audio 1" }]);
  assert.deepEqual(m2, { drums: null, bass: null });
});

test("resolveMapping beruecksichtigt manuelle Auswahl", function () {
  var stems = ["drums", "bass", "other"];
  var m = core.resolveMapping(stems, TRACKS, { drums: "Keine", bass: "4: Lead Synth", other: "Auto" });
  assert.deepEqual(m, { drums: null, bass: 3, other: 3 });
  assert.equal(core.resolveMapping(stems, TRACKS, { bass: "99: weg" }).bass, 1);
  assert.deepEqual(core.menuItems(TRACKS).slice(0, 3), ["Auto", "Keine", "1: Kick & Drums"]);
  assert.ok(core.menuItems(TRACKS).indexOf("3: Synths") === -1);
});

test("parseDisplayValue liest Live-Anzeigen", function () {
  assert.equal(core.parseDisplayValue("1.20 kHz", "Hz"), 1200);
  assert.equal(core.parseDisplayValue("500 Hz", "Hz"), 500);
  assert.equal(core.parseDisplayValue("-6.0 dB", "dB"), -6);
  assert.equal(core.parseDisplayValue("-inf dB", "dB"), -Infinity);
  assert.equal(core.parseDisplayValue("12,5 dB", "dB"), 12.5);
  assert.equal(core.parseDisplayValue("abc", "Hz"), null);
  assert.equal(core.parseDisplayValue("3 dB", "Hz"), null);
});

test("buildInverseMap invertiert logarithmische Frequenzskala", function () {
  var samples = [];
  for (var i = 0; i < 64; i++) {
    var raw = i / 63;
    var hz = 26 * Math.pow(19900 / 26, raw);
    samples.push([raw, hz >= 1000 ? (hz / 1000).toFixed(2) + " kHz" : hz.toFixed(1) + " Hz"]);
  }
  var inv = core.buildInverseMap(samples, "Hz");
  var expect = Math.log(1000 / 26) / Math.log(19900 / 26);
  assert.ok(Math.abs(inv(1000) - expect) < 0.01);
  assert.equal(inv(5), 0);
  assert.equal(inv(50000), 1);
  var dbInv = core.buildInverseMap([[-1, "-inf dB"], [-0.5, "-17.5 dB"], [0, "0.00 dB"], [1, "35.0 dB"]], "dB");
  assert.ok(Math.abs(dbInv(-8.75) - -0.25) < 1e-9);
  assert.equal(dbInv(-100), -0.5);
  assert.equal(core.buildInverseMap([[0, "x"]], "Hz"), null);
});

test("sliceAutomation erzeugt Schritte relativ zum Abschnitt", function () {
  var pts = [{ beat: 0, value: 20000 }, { beat: 32, value: 400 }, { beat: 40, value: 1600 }, { beat: 64, value: 20000 }];
  assert.deepEqual(core.sliceAutomation(pts, 0, 32), [[0, 32, 20000]]);
  assert.deepEqual(core.sliceAutomation(pts, 32, 32), [[0, 8, 400], [8, 24, 1600]]);
  assert.deepEqual(core.sliceAutomation(pts, 36, 32), [[0, 4, 400], [4, 24, 1600], [28, 4, 20000]]);
  assert.deepEqual(core.sliceAutomation([], 0, 16), []);
  assert.ok(core.isNeutral("filter_cutoff", [[0, 32, 20000]]));
  assert.ok(!core.isNeutral("gain", [[0, 4, -6]]));
});

test("findParam: exakter Name vor Praefix", function () {
  var params = [{ index: 0, name: "Device On" }, { index: 1, name: "Frequency Mod" }, { index: 2, name: "Frequency" }];
  assert.equal(core.findParam(params, "Frequency").index, 2);
  assert.equal(core.findParam([{ index: 5, name: "Freq" }], "Frequency").index, 5);
  assert.equal(core.findParam(params, "Gain"), null);
});

test("buildPlan mit echter Engine-Analyse", function () {
  var state = { tracks: TRACKS };
  var mapping = { drums: 0, bass: 1, other: 3 };
  var plan = core.buildPlan(analysis, state, {}, mapping);
  assert.equal(plan.tempo, analysis.tempo.bpm);
  assert.deepEqual(plan.locators.map(function (l) { return l.name; }), analysis.sections.map(function (s) { return s.label; }));
  assert.deepEqual(plan.locators[1], { time: analysis.sections[1].start_beat, name: analysis.sections[1].label });

  var other = plan.tracks.find(function (t) { return t.stem === "other"; });
  var activeCount = analysis.stems[2].active_sections.filter(Boolean).length;
  assert.equal(other.clips.length, activeCount);
  var build = other.clips.find(function (c) { return c.name === "Build"; });
  var env = build.envelopes.find(function (e) { return e.target === "filter_cutoff"; });
  assert.ok(env.steps.length > 4, "Sweep braucht mehrere Schritte");
  assert.ok(env.steps[0][2] < env.steps[env.steps.length - 1][2], "Cutoff steigt im Build");
  var total = env.steps.reduce(function (s, x) { return s + x[1]; }, 0);
  assert.ok(Math.abs(total - build.length) < 1e-6);

  var afDevice = plan.devices.find(function (d) { return d.track === 3 && d.class_name === "AutoFilter"; });
  assert.equal(afDevice.present, true);
  var drumsFilter = plan.devices.find(function (d) { return d.track === 0 && d.class_name === "AutoFilter"; });
  assert.equal(drumsFilter.present, false);
  assert.ok(plan.devices.some(function (d) { return d.track === 1 && d.device === "Utility"; }));
  var stats = core.planStats(plan);
  assert.equal(stats.locators, analysis.sections.length);
  assert.ok(stats.clips > 0 && stats.envelopes > 0);
});

test("buildPlan: nur Automation -> nur nicht-neutrale Abschnitte; Audiospuren werden gemeldet", function () {
  var state = { tracks: TRACKS };
  var plan = core.buildPlan(analysis, state, { build_arrangement: false }, { other: 3, bass: 4 });
  assert.equal(plan.locators.length, 0);
  assert.equal(plan.tempo, null);
  var other = plan.tracks.find(function (t) { return t.stem === "other"; });
  assert.ok(other.clips.length >= 1 && other.clips.length < analysis.sections.length);
  assert.ok(other.clips.every(function (c) {
    return c.envelopes.some(function (e) { return !core.isNeutral(e.target, e.steps); });
  }));
  assert.ok(!plan.tracks.some(function (t) { return t.track === 4; }));
  assert.ok(plan.warnings.some(function (w) { return w.indexOf("Audiospur") !== -1; }));
  assert.ok(plan.devices.some(function (d) { return d.track === 4 && d.device === "Utility"; }));
});

test("buildPlan: ohne Automation werden keine Geraete geplant", function () {
  var plan = core.buildPlan(analysis, { tracks: TRACKS }, { apply_automation: false }, { other: 3 });
  assert.equal(plan.devices.length, 0);
  assert.ok(plan.tracks[0].clips.every(function (c) { return c.envelopes.length === 0; }));
});

test("formatSummary enthaelt Songteile, Zuordnung und Vorschlaege", function () {
  var text = core.formatSummary(analysis, { drums: 0, other: null }, { tracks: TRACKS });
  assert.ok(text.indexOf("Tempo 128") === 0);
  assert.ok(text.indexOf("Build") !== -1);
  assert.ok(text.indexOf("drums -> 1: Kick & Drums") !== -1);
  assert.ok(text.indexOf("other -> -") !== -1);
  assert.ok(text.indexOf("Auto Filter") !== -1);
  var silent = JSON.parse(JSON.stringify(analysis));
  silent.stems.push({ name: "vocals", present: false, active_sections: [], automation: [] });
  assert.ok(core.formatSummary(silent, { vocals: 4 }, { tracks: TRACKS }).indexOf("vocals -> 5: Lead Vox (in Referenz stumm)") !== -1);
});
