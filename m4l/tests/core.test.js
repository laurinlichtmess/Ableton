"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var core = require("../js/rr_core");
var analysis = require("./fixtures/analysis.json");

function loop(color) {
  return { kind: "session", index: 0, length: 32, color_index: color, name: "loop", looping: true, loop_start: 0, loop_end: 32 };
}
var TRACKS = [
  { index: 0, name: "Kick", has_midi_input: true, is_foldable: false, devices: [], source_loop: loop(69) },
  { index: 1, name: "Bass", has_midi_input: true, is_foldable: false, devices: [], source_loop: loop(26) },
  { index: 2, name: "Clap", has_midi_input: true, is_foldable: false, devices: [], source_loop: loop(63) },
  { index: 3, name: "Group Synths", has_midi_input: true, is_foldable: true, devices: [], source_loop: null },
  { index: 4, name: "Lead Synth", has_midi_input: true, is_foldable: false, devices: [{ index: 0, name: "Auto Filter", class_name: "AutoFilter" }], source_loop: loop(14) },
  { index: 5, name: "Atmo Pads", has_midi_input: true, is_foldable: false, devices: [], source_loop: loop(20) },
  { index: 6, name: "Lead Vox", has_midi_input: false, is_foldable: false, devices: [], source_loop: loop(8) },
];

test("toPosixPath wandelt Max-Pfade um", function () {
  assert.equal(core.toPosixPath("Macintosh HD:/Users/me/a b.mp3"), "/Users/me/a b.mp3");
  assert.equal(core.toPosixPath("/Users/me/a.mp3"), "/Users/me/a.mp3");
  var exists = function (p) { return p === "/Volumes/Samples/x.mp3"; };
  assert.equal(core.toPosixPath("Samples:/x.mp3", exists), "/Volumes/Samples/x.mp3");
});

test("autoMapStems ordnet feine Elemente nach Namen zu", function () {
  var m = core.autoMapStems(["kick", "bass", "clap", "synth", "atmo", "vocals"], TRACKS);
  assert.equal(m.kick, 0);
  assert.equal(m.bass, 1);
  assert.equal(m.clap, 2);
  assert.equal(m.synth, 4);
  assert.equal(m.atmo, 5);
  assert.equal(m.vocals, 6);
  var m2 = core.autoMapStems(["kick", "bass"], [{ index: 0, name: "Audio 1" }]);
  assert.deepEqual(m2, { kick: null, bass: null });
});

test("autoMapStems bevorzugt MIDI gegenueber Audio-Sample-Namen (CursorTest-Fall)", function () {
  var tracks = [
    { index: 2, name: "kick", has_midi_input: true, is_foldable: false },
    { index: 8, name: "perc synth", has_midi_input: true, is_foldable: false },
    { index: 17, name: "hihat", has_midi_input: true, is_foldable: false },
    { index: 23, name: "24-seedj_drum_loop_corp-hats_132", has_midi_input: false, is_foldable: false },
    { index: 30, name: "audio vocales", has_midi_input: false, is_foldable: false },
  ];
  var m = core.autoMapStems(["kick", "hats", "synth", "vocals"], tracks);
  assert.equal(m.kick, 2, "kick -> kick (MIDI)");
  assert.equal(m.hats, 17, "hats -> hihat (MIDI), nicht Audio-…hats_132");
  assert.equal(m.synth, 8);
  assert.equal(m.vocals, 30);
  assert.ok(core.scoreTrack("hats", "hihat") > 0);
  assert.ok(core.scoreTrack("kick", "kick") > core.scoreTrack("kick", "24-seedj_drum_loop_corp-hats_132"));
});

test("resolveMapping beruecksichtigt manuelle Auswahl", function () {
  var stems = ["kick", "bass", "synth"];
  var m = core.resolveMapping(stems, TRACKS, { kick: "Keine", bass: "5: Lead Synth", synth: "Auto" });
  assert.deepEqual(m, { kick: null, bass: 4, synth: 4 });
  assert.equal(core.resolveMapping(stems, TRACKS, { bass: "99: weg" }).bass, 1);
  assert.deepEqual(core.menuItems(TRACKS).slice(0, 3), ["Auto", "Keine", "1: Kick"]);
  assert.ok(core.menuItems(TRACKS).indexOf("4: Group Synths") === -1);
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

test("referenceLengthBeats nimmt das Maximum aus Abschnitten/Dauer/Takten", function () {
  var len = core.referenceLengthBeats(analysis);
  var last = analysis.sections[analysis.sections.length - 1];
  var sectionEnd = last.start_beat + last.length_beats;
  var fromDur = analysis.source.duration_sec * analysis.tempo.bpm / 60;
  var fromBars = analysis.tempo.num_bars * 4;
  assert.ok(Math.abs(len - Math.max(sectionEnd, fromDur, fromBars)) < 0.02);
  assert.ok(len >= sectionEnd - 1e-6);
});

test("buildPlan kachelt Loops ueber die volle Referenzlaenge", function () {
  var state = { tracks: TRACKS };
  var mapping = { kick: 0, bass: 1, synth: 4, atmo: 5 };
  var plan = core.buildPlan(analysis, state, {}, mapping);
  var refLen = core.referenceLengthBeats(analysis);
  assert.equal(plan.tempo, analysis.tempo.bpm);
  assert.equal(plan.reference_length_beats, refLen);
  assert.deepEqual(plan.locators.map(function (l) { return l.name; }), analysis.sections.map(function (s) { return s.label; }));
  assert.deepEqual(plan.locators[1], { time: analysis.sections[1].start_beat, name: analysis.sections[1].label });

  assert.equal(plan.tracks.length, 4, "alle gemappten Spuren mit Loop bekommen Clips");
  plan.tracks.forEach(function (t) {
    assert.ok(t.clips.length >= 2, t.stem + " braucht mehrere Kacheln, nicht nur 1–2 Abschnitte");
    assert.ok(Math.abs(t.coverage_beats - refLen) < 0.05, t.stem + " deckt volle Laenge ab");
    assert.equal(t.carved, false, "Default ohne Presence-Carve");
    assert.equal(t.clips[0].color_index, t.source_loop.color_index);
    assert.equal(t.clips[0].source_kind, "session");
    var covered = t.clips.reduce(function (s, c) { return s + c.length; }, 0);
    assert.ok(Math.abs(covered - refLen) < 0.05);
  });

  var synth = plan.tracks.find(function (t) { return t.stem === "synth"; });
  assert.ok(synth, "Synth-Spur im Plan");
  var build = synth.clips.find(function (c) { return c.name === "Build"; });
  assert.ok(build, "Build-Kachel geplant");
  assert.equal(build.color_index, 14, "Farbe vom Quell-Loop");
  var env = build.envelopes.find(function (e) { return e.target === "filter_cutoff"; });
  assert.ok(env && env.steps.length > 1, "Sweep braucht mehrere Schritte");
  var total = env.steps.reduce(function (s, x) { return s + x[1]; }, 0);
  assert.ok(Math.abs(total - build.length) < 1e-6);
  assert.ok(plan.devices.some(function (d) { return d.track === 4 && d.class_name === "AutoFilter"; }));
  var stats = core.planStats(plan);
  assert.equal(stats.locators, analysis.sections.length);
  assert.ok(stats.clips >= 4 * Math.floor(refLen / 32), "viele Kacheln statt ~3 Clips gesamt");
});

test("buildPlan: dünne/fehlende Presence → trotzdem volle Kachelung", function () {
  var sparse = JSON.parse(JSON.stringify(analysis));
  sparse.stems.forEach(function (s) {
    s.active_sections = s.active_sections.map(function (_, i) { return i === 2; });
    s.presence_bars = s.presence_bars.map(function () { return false; });
    s.presence_bars[16] = true;
  });
  var plan = core.buildPlan(sparse, { tracks: TRACKS }, {}, { kick: 0, synth: 4 });
  var refLen = core.referenceLengthBeats(sparse);
  plan.tracks.forEach(function (t) {
    assert.ok(Math.abs(t.coverage_beats - refLen) < 0.05, t.stem + " Fallback volle Laenge");
  });
  // Explizite Carve-outs bei brauchbarer Presence sparren Stille, bleiben aber spielbar.
  var carved = core.buildPlan(analysis, { tracks: TRACKS }, { presence_carve_outs: true }, { kick: 0 });
  var kick = carved.tracks.find(function (t) { return t.stem === "kick"; });
  assert.ok(kick && kick.clips.length >= 1);
  assert.ok(kick.coverage_beats > 16, "Carve laesst Spur nicht fast leer");
});

test("buildPlan: ohne Arrangement-Option keine Clips; fehlender Loop wird gemeldet", function () {
  var state = { tracks: TRACKS };
  var plan = core.buildPlan(analysis, state, { build_arrangement: false }, { synth: 4, bass: 6 });
  assert.equal(plan.locators.length, 0);
  assert.equal(plan.tempo, null);
  assert.equal(plan.tracks.length, 0);
  // Ohne Arrangement-Clips keine Envelopes → keine Geraete (kein Orphan-FX).
  assert.equal(plan.devices.length, 0);
  var noLoop = JSON.parse(JSON.stringify(TRACKS));
  noLoop[0].source_loop = null;
  var plan2 = core.buildPlan(analysis, { tracks: noLoop }, {}, { kick: 0 });
  assert.ok(plan2.warnings.some(function (w) { return /kein Loop/.test(w); }));
  assert.ok(!plan2.tracks.some(function (t) { return t.stem === "kick"; }));
});

test("buildPlan: flache Automation plant kein Filter/Utility", function () {
  var flat = JSON.parse(JSON.stringify(analysis));
  var synth = flat.stems.find(function (s) { return s.name === "synth"; });
  synth.automation = [{
    target: "filter_cutoff", device: "Auto Filter", class_name: "AutoFilter",
    parameter: "Frequency", unit: "Hz",
    points: [{ beat: 0, value: 20000 }, { beat: 64, value: 20000 }],
  }];
  var kick = flat.stems.find(function (s) { return s.name === "kick"; });
  kick.automation = [{
    target: "gain", device: "Utility", class_name: "StereoGain",
    parameter: "Gain", unit: "dB",
    points: [{ beat: 0, value: 0 }, { beat: 64, value: 0 }],
  }];
  var plan = core.buildPlan(flat, { tracks: TRACKS }, {}, { kick: 0, synth: 4 });
  assert.equal(plan.devices.length, 0);
  plan.tracks.forEach(function (t) {
    t.clips.forEach(function (c) { assert.equal(c.envelopes.length, 0); });
  });
  assert.ok(core.pointsHaveMotion("filter_cutoff", [{ beat: 0, value: 400 }, { beat: 32, value: 8000 }]));
  assert.ok(!core.pointsHaveMotion("filter_cutoff", [{ beat: 0, value: 20000 }, { beat: 32, value: 20000 }]));
});

test("buildPlan: ohne Automation werden keine Geraete geplant", function () {
  var plan = core.buildPlan(analysis, { tracks: TRACKS }, { apply_automation: false }, { synth: 4 });
  assert.equal(plan.devices.length, 0);
  assert.ok(plan.tracks[0].clips.every(function (c) { return c.envelopes.length === 0; }));
});

test("formatSummary enthaelt Songteile, Zuordnung und Vorschlaege", function () {
  var text = core.formatSummary(analysis, { kick: 0, synth: null }, { tracks: TRACKS });
  assert.ok(text.indexOf("Tempo 128") === 0);
  assert.ok(text.indexOf("Build") !== -1);
  assert.ok(text.indexOf("Kick -> 1: Kick") !== -1);
  assert.ok(text.indexOf("[Loop session") !== -1);
  assert.ok(text.indexOf("Synth -> -") !== -1);
  var silent = JSON.parse(JSON.stringify(analysis));
  var vox = silent.stems.find(function (s) { return s.name === "vocals"; });
  if (vox) vox.present = false;
  assert.ok(core.formatSummary(silent, { vocals: 6 }, { tracks: TRACKS }).indexOf("Vocals -> 7: Lead Vox") !== -1);
  assert.ok(core.formatSummary(silent, { vocals: 6 }, { tracks: TRACKS }).indexOf("(stumm)") !== -1);
});

test("STEMS enthaelt die feinen Live-Track-Namen", function () {
  assert.deepEqual(core.STEMS, ["kick", "bass", "clap", "hats", "ride", "perc", "atmo", "synth", "vocals"]);
  assert.equal(core.STEM_LABELS.kick, "Kick");
});
