"use strict";
// Ende-zu-Ende ohne Live: Orchestrator -> live_bridge.js (in VM) -> Fake-LOM; Remote Script simuliert.
var test = require("node:test");
var assert = require("node:assert/strict");
var FakeLive = require("./fake_lom").FakeLive;
var Orchestrator = require("../js/rr_orchestrator").Orchestrator;
var analysis = require("./fixtures/analysis.json");

function setup(opts) {
  opts = opts || {};
  var live = new FakeLive();
  live.addScene();
  var drums = live.addTrack("Drums", true);
  var bass = live.addTrack("Bass", true);
  var lead = live.addTrack("Lead Synth", true);
  live.addTrack("Reference", false);
  // Vorhandene ~8-Takt-Loops (Session) – Apply dupliziert diese, erzeugt keine leeren Clips.
  drums.clip_slots[0].clip = live.makeClip({ name: "user clip", length: 32, color_index: 69, notes: [[0, 1, 36, 100]] });
  bass.clip_slots[0].clip = live.makeClip({ name: "bass loop", length: 32, color_index: 26, notes: [[0, 1, 40, 100]] });
  lead.clip_slots[0].clip = live.makeClip({ name: "lead loop", length: 32, color_index: 14, notes: [[0, 1, 60, 100]] });
  var bridge = live.loadBridge();
  var ui = { statuses: [], summaries: [], menus: {} };
  var remoteCalls = [];
  var jobPolls = 0;
  var deps = {
    lom: bridge.lom,
    ui: {
      status: function (t) { ui.statuses.push(t); },
      summary: function (t) { ui.summaries.push(t); },
      menu: function (stem, items, sel) { ui.menus[stem] = { items: items, sel: sel }; },
    },
    exists: function () { return true; },
    sleep: function () { return Promise.resolve(); },
    startEngine: function () { return !!opts.canStart; },
    engine: {
      health: function () {
        if (opts.engineDown) return Promise.reject(new Error("ECONNREFUSED"));
        return Promise.resolve({ status: "ok", demucs_available: false });
      },
      createJob: function (p, sep) {
        ui.job = { path: p, separation: sep };
        return Promise.resolve({ job_id: "j1", status: "queued" });
      },
      getJob: function () {
        jobPolls++;
        if (jobPolls < 3) return Promise.resolve({ status: "running", progress: 0.5, message: "Demucs" });
        if (opts.jobError) return Promise.resolve({ status: "error", error: "Datei kaputt" });
        return Promise.resolve({ status: "done", progress: 1, result: analysis });
      },
    },
    remote: {
      request: function (msg) {
        remoteCalls.push(msg);
        if (opts.remoteDown) return Promise.reject(new Error("Remote Script antwortet nicht (Port 47822)"));
        if (opts.remoteFails && opts.remoteFails(msg)) return Promise.reject(new Error("RuntimeError: kaputt"));
        try { return Promise.resolve(live.remoteScript(msg)); } catch (e) { return Promise.reject(e); }
      },
    },
  };
  return { live: live, orch: new Orchestrator(deps), ui: ui, remoteCalls: remoteCalls, bridge: bridge };
}

test("Analyse: Datei -> Job -> Zusammenfassung und Spurmenues", async function () {
  var s = setup();
  s.orch.setFile("Macintosh HD:/Users/demo/Music/reference.mp3");
  var result = await s.orch.analyze();
  assert.equal(result.tempo.bpm, 128);
  assert.equal(s.ui.job.path, "/Users/demo/Music/reference.mp3");
  assert.ok(s.ui.statuses.some(function (t) { return t.indexOf("Analyse 50%") === 0; }));
  assert.ok(s.ui.statuses[s.ui.statuses.length - 1].indexOf("Analyse fertig") === 0);
  assert.deepEqual(s.ui.menus.kick.items.slice(0, 3), ["Auto", "Keine", "1: Drums"]);
  assert.ok(s.ui.summaries[s.ui.summaries.length - 1].indexOf("Kick -> 1: Drums") !== -1);
});

test("Analyse ohne Datei bzw. ohne Engine meldet verstaendliche Fehler", async function () {
  var s = setup();
  assert.equal(await s.orch.analyze(), false);
  assert.match(s.ui.statuses.pop(), /MP3/);
  var s2 = setup({ engineDown: true });
  s2.orch.setFile("/x.mp3");
  assert.equal(await s2.orch.analyze(), false);
  assert.match(s2.ui.statuses.pop(), /start-engine/);
  var s3 = setup({ jobError: true });
  s3.orch.setFile("/x.mp3");
  assert.equal(await s3.orch.analyze(), false);
  assert.match(s3.ui.statuses.pop(), /Datei kaputt/);
});

test("Anwenden baut Tempo, Locators, Geraete, Clips mit Envelopes im Arrangement", async function () {
  var s = setup();
  s.orch.setFile("/ref.mp3");
  await s.orch.analyze();
  var report = await s.orch.apply();
  var song = s.live.song;

  assert.equal(song.tempo, 128);
  assert.deepEqual(song.cue_points.map(function (c) { return c.name; }), analysis.sections.map(function (x) { return x.label; }));
  assert.deepEqual(song.cue_points.map(function (c) { return c.time; }), analysis.sections.map(function (x) { return x.start_beat; }));

  // Remote Script: Utility (kick, bass) und Auto Filter (synth) fehlten
  var loads = s.remoteCalls.filter(function (c) { return c.cmd === "load_device"; });
  var loaded = loads.map(function (c) { return c.track_index + ":" + c.device; }).sort();
  assert.deepEqual(loaded, ["0:Utility", "1:Utility", "2:Auto Filter"]);
  assert.equal(report.devices_inserted.length, 3);

  var lead = song.tracks[2];
  var synthStem = analysis.stems.find(function (st) { return st.name === "synth"; });
  var activeSynth = synthStem.active_sections.filter(Boolean).length;
  assert.ok(lead.arrangement_clips.length >= activeSynth);
  var build = lead.arrangement_clips.find(function (c) { return c.name === "Build"; });
  assert.equal(build.start_time, analysis.sections[1].start_beat);
  assert.equal(build.length, analysis.sections[1].length_beats);
  assert.equal(build.color_index, 14, "Farbe wie Original-Loop");
  assert.ok(build.notes && build.notes.length > 0, "Inhalt vom Quell-Loop, nicht leer");
  var env = build.envelopes[Object.keys(build.envelopes)[0]];
  assert.equal(env.param.name, "Frequency");
  assert.ok(env.steps.length > 1);
  assert.ok(env.steps.every(function (st) { return st[2] >= 0 && st[2] <= 1; }), "Rohwerte im Parameterbereich");
  assert.ok(env.steps[0][2] < env.steps[env.steps.length - 1][2], "Sweep steigt");

  // Die Hilfs-Szene ist wieder weg, der Session-Loop des Users unangetastet.
  assert.equal(song.scenes.length, 1);
  assert.equal(song.tracks[0].clip_slots.length, 1);
  assert.equal(song.tracks[0].clip_slots[0].clip.name, "user clip");
  assert.equal(song.tracks[0].arrangement_clips[0].color_index, 69);
  assert.ok(song.tracks[0].arrangement_clips[0].notes.length > 0);
  assert.equal(song.tracks[3].arrangement_clips.length, 0, "Audiospur ohne Stem bleibt leer");

  assert.equal(report.locators, analysis.sections.length);
  assert.ok(report.clips >= activeSynth && report.envelopes > 0);
  assert.match(s.ui.statuses.pop(), /^Fertig: /);
  assert.ok(s.ui.summaries.pop().indexOf("vorhandene Loop") !== -1);
});

test("Ohne Remote Script: Locators und Clips trotzdem, Automation mit Hinweis uebersprungen", async function () {
  var s = setup({ remoteDown: true });
  s.live.song.tracks[2].devices.push(s.live.makeDevice("Auto Filter"));
  s.orch.setFile("/ref.mp3");
  await s.orch.analyze();
  var report = await s.orch.apply();
  assert.ok(report.warnings.some(function (w) { return w.indexOf("nicht eingefuegt") !== -1; }));
  assert.ok(report.warnings.some(function (w) { return w.indexOf("Automation uebersprungen") !== -1; }));
  assert.ok(report.warnings.some(function (w) { return w.indexOf("Remote Script nicht erreichbar") === 0; }));
  assert.equal(report.locators, analysis.sections.length);
  var build = s.live.song.tracks[2].arrangement_clips.find(function (c) { return c.name === "Build"; });
  assert.ok(build, "Clip trotz fehlender Automation angelegt");
  assert.equal(Object.keys(build.envelopes).length, 0);
  assert.equal(report.envelopes, 0);
  // Nach dem ersten Timeout keine weiteren Versuche (sonst 5 s pro Clip).
  var envelopeCalls = s.remoteCalls.filter(function (c) { return c.cmd === "write_envelope"; });
  assert.ok(envelopeCalls.length <= 1, "write_envelope-Versuche: " + envelopeCalls.length);
  assert.match(s.ui.statuses.pop(), /Hinweis\(e\) im Textfeld/);
});

test("Fehlschlagende Einzelschritte brechen Anwenden nicht ab und landen im Textfeld", async function () {
  var s = setup({ remoteFails: function (m) { return m.cmd === "write_envelope" && m.track_index === 0; } });
  s.orch.setFile("/ref.mp3");
  await s.orch.analyze();
  var origLom = s.orch.deps.lom;
  s.orch.deps.lom = function (op) {
    if (op.op === "set_locator" && op.name === "Build") return Promise.reject(new Error("Invalid syntax"));
    if (op.op === "set_tempo") return Promise.reject(new Error("Tempo gesperrt"));
    return origLom(op);
  };
  var report = await s.orch.apply();
  var song = s.live.song;
  assert.equal(report.locators, analysis.sections.length - 1);
  assert.ok(report.warnings.some(function (w) { return /^Locator 'Build'.*Invalid syntax/.test(w); }));
  assert.ok(report.warnings.some(function (w) { return /^Tempo .*Tempo gesperrt/.test(w); }));
  assert.ok(report.warnings.some(function (w) { return /Automation .*RuntimeError: kaputt/.test(w); }));
  assert.ok(song.tracks[0].arrangement_clips.length > 0, "Drum-Clips trotz Envelope-Fehler");
  var build = song.tracks[2].arrangement_clips.find(function (c) { return c.name === "Build"; });
  assert.equal(Object.keys(build.envelopes).length, 1, "andere Spuren bekommen ihre Automation");
  assert.equal(song.scenes.length, 1, "Hilfs-Szene aufgeraeumt");
  assert.ok(s.ui.summaries.pop().indexOf("Hinweise beim Anwenden") !== -1);
});

test("Manuelle Zuordnung und Optionen werden beachtet", async function () {
  var s = setup();
  s.orch.setFile("/ref.mp3");
  await s.orch.analyze();
  s.orch.setOverride("kick", "Keine");
  s.orch.setOverride("bass", "Keine");
  s.orch.setOverride("hats", "Keine");
  s.orch.setOverride("synth", "4: Reference");
  s.orch.setOverride("atmo", "Keine");
  s.orch.setOption("build_arrangement", 0);
  var report = await s.orch.apply();
  assert.equal(s.live.song.cue_points.length, 0);
  assert.equal(s.live.song.tempo, 120);
  assert.equal(report.clips, 0);
  assert.deepEqual(s.remoteCalls.filter(function (c) { return c.cmd === "load_device"; })
    .map(function (c) { return c.track_index + ":" + c.device; }), ["3:Auto Filter"]);
});

test("Anwenden ohne Analyse und paralleles Anwenden werden abgefangen", async function () {
  var s = setup();
  assert.equal(await s.orch.apply(), false);
  assert.match(s.ui.statuses.pop(), /analysieren/);
  s.orch.setFile("/ref.mp3");
  await s.orch.analyze();
  var first = s.orch.apply();
  assert.equal(await s.orch.apply(), false);
  assert.match(s.ui.statuses.pop(), /laeuft noch/);
  await first;
});
