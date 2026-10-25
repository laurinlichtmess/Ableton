"use strict";
// Dry-Check: CursorTest.als Spurstruktur + Fixture-Analyse → Fake-Live Apply.
// Aufruf: node m4l/tests/dry_cursortest_apply.js
var assert = require("assert");
var path = require("path");
var FakeLive = require("./fake_lom").FakeLive;
var Orchestrator = require("../js/rr_orchestrator").Orchestrator;
var core = require("../js/rr_core");
var analysis = require("./fixtures/analysis.json");

// Vereinfachte Spurkarte aus CursorTest.als (Arrangement-Loops mit Noten am Anfang).
var CURSOR_TRACKS = [
  { name: "kick", midi: true, color: 69, notes: [[0, 1, 36, 100], [4, 1, 36, 100], [8, 1, 36, 100], [12, 1, 36, 100]] },
  { name: "sc", midi: true, color: 69, notes: [[0, 1, 36, 100]] },
  { name: "5-Audio", midi: false, color: 69, notes: [] },
  { name: "tribal", midi: true, color: 69, notes: [[0, 0.5, 40, 100], [1, 0.5, 41, 100]] },
  { name: "303", midi: true, color: 26, notes: [[0, 0.25, 48, 100]] },
  { name: "perc synth", midi: true, color: 69, notes: [[0, 0.5, 60, 100], [2, 0.5, 64, 100]] },
  { name: "hihat", midi: true, color: 63, notes: [[0, 0.25, 62, 100], [1, 0.25, 62, 100], [2, 0.25, 62, 100]] },
  { name: "ride", midi: true, color: 63, notes: [[0, 1, 51, 100]] },
  { name: "clap", midi: true, color: 63, notes: [[4, 0.5, 39, 100], [12, 0.5, 39, 100]] },
  { name: "audio vocales", midi: false, color: 10, notes: [], start: 15 },
];

function buildLive() {
  var live = new FakeLive();
  live.addScene();
  CURSOR_TRACKS.forEach(function (t) {
    var tr = live.addTrack(t.name, t.midi);
    if (t.midi) {
      tr.arrangement_clips.push(live.makeClip({
        name: t.name + " loop", length: 32, color_index: t.color,
        start_time: t.start || 0, notes: t.notes,
      }));
    } else {
      tr.arrangement_clips.push(live.makeClip({
        name: t.name, length: 32, color_index: t.color,
        start_time: t.start || 0, audio: true, notes: [],
      }));
    }
  });
  return live;
}

async function main() {
  var live = buildLive();
  var bridge = live.loadBridge();
  var state = await bridge.lom({ op: "get_state" });
  var mapping = core.autoMapStems(core.STEMS, state.tracks);
  console.log("Mapping:", JSON.stringify(mapping, null, 2));
  Object.keys(mapping).forEach(function (stem) {
    var idx = mapping[stem];
    if (idx == null) return;
    var tr = state.tracks[idx];
    console.log("  ", stem, "->", (idx + 1) + ":", tr.name,
      tr.source_loop
        ? ("[Loop " + tr.source_loop.kind + ", " + tr.source_loop.length + " beats, Farbe " +
          tr.source_loop.color_index + ", notes=" + tr.source_loop.note_count + "]")
        : "[kein Loop]");
  });

  var plan = core.buildPlan(analysis, state, { build_arrangement: true, apply_automation: true, set_tempo: true }, mapping);
  console.log("\nPlan: tempo=", plan.tempo, "locators=", plan.locators.length,
    "tracks=", plan.tracks.length, "devices=", plan.devices.length);
  plan.devices.forEach(function (d) {
    console.log("  device", d.track, d.device, "present=" + d.present);
  });
  plan.warnings.forEach(function (w) { console.log("  warn:", w); });
  plan.tracks.forEach(function (t) {
    var withEnv = t.clips.filter(function (c) { return c.envelopes.length; }).length;
    console.log("  track", t.track, t.name, "stem=" + t.stem, "clips=" + t.clips.length,
      "envClips=" + withEnv, "can_automate=" + t.can_automate);
  });

  assert.ok(plan.tracks.length >= 4, "mind. Kick/Hats/Clap/Synth gemappt mit Clips");
  plan.tracks.forEach(function (t) {
    assert.ok(t.clips.length > 0);
    assert.ok(t.source_loop);
  });
  // Kein Device ohne Envelope-Bedarf
  plan.devices.forEach(function (d) {
    var needed = plan.tracks.some(function (t) {
      return t.track === d.track && t.clips.some(function (c) {
        return c.envelopes.some(function (e) { return e.class_name === d.class_name; });
      });
    });
    assert.ok(needed, "Orphan-Device im Plan: " + d.device + " track " + d.track);
  });

  var ui = { statuses: [], summaries: [] };
  var remoteCalls = [];
  var orch = new Orchestrator({
    lom: bridge.lom,
    ui: {
      status: function (t) { ui.statuses.push(t); },
      summary: function (t) { ui.summaries.push(t); },
      menu: function () {},
    },
    exists: function () { return true; },
    sleep: function () { return Promise.resolve(); },
    startEngine: function () { return false; },
    engine: {
      health: function () { return Promise.resolve({ status: "ok" }); },
      createJob: function () { return Promise.resolve({ job_id: "dry", status: "queued" }); },
      getJob: function () { return Promise.resolve({ status: "done", progress: 1, result: analysis }); },
    },
    remote: {
      request: function (msg) {
        remoteCalls.push(msg);
        return Promise.resolve(live.remoteScript(msg));
      },
    },
  });
  orch.setFile("/dry/ref.mp3");
  await orch.analyze();
  // Overrides wie typisches CursorTest-Mapping
  orch.setOverride("kick", "1: kick");
  orch.setOverride("hats", "7: hihat");
  orch.setOverride("clap", "9: clap");
  orch.setOverride("synth", "6: perc synth");
  orch.setOverride("bass", "5: 303");
  orch.setOverride("ride", "8: ride");
  orch.setOverride("vocals", "Keine");
  var report = await orch.apply();

  console.log("\nApply report:", {
    locators: report.locators,
    clips: report.clips,
    envelopes: report.envelopes,
    devices_inserted: report.devices_inserted,
    warnings: report.warnings,
  });

  var midiWithClips = 0;
  live.song.tracks.forEach(function (tr, i) {
    var arr = tr.arrangement_clips.filter(function (c) {
      return c.start_time > 0.1 || (c.name && /Intro|Build|Drop|Verse|Chorus|Outro|Break/i.test(c.name));
    });
    // Count section placements (name matches analysis labels)
    var sectionClips = tr.arrangement_clips.filter(function (c) {
      return analysis.sections.some(function (s) { return s.label === c.name; });
    });
    if (sectionClips.length) {
      midiWithClips++;
      var notesOk = sectionClips.every(function (c) {
        return !tr.has_midi_input || (c.notes && c.notes.length > 0);
      });
      var colors = sectionClips.map(function (c) { return c.color_index; });
      console.log("  arranged", i, tr.name, "sectionClips=" + sectionClips.length,
        "notesOk=" + notesOk, "colors=" + colors.slice(0, 3).join(","));
      assert.ok(notesOk, tr.name + " hat leere MIDI-Section-Clips");
    }
  });
  assert.ok(midiWithClips >= 4, "zu wenige Spuren mit Section-Clips: " + midiWithClips);
  assert.ok(report.clips >= 10, "zu wenige Clips: " + report.clips);
  assert.ok(report.envelopes > 0, "keine Envelopes geschrieben");
  // Jedes geladene Device muss zu einer Spur mit Envelope gehoeren
  remoteCalls.filter(function (c) { return c.cmd === "load_device"; }).forEach(function (c) {
    var writes = remoteCalls.filter(function (w) {
      return w.cmd === "write_envelope" && w.track_index === c.track_index;
    });
    assert.ok(writes.length > 0, "Orphan load_device ohne Envelope: " + c.device + " @" + c.track_index);
  });
  console.log("\nDRY OK — notes+structure+automation-with-devices");
  console.log("Summary tail:\n", (ui.summaries[ui.summaries.length - 1] || "").slice(-400));
}

main().catch(function (e) {
  console.error("DRY FAIL:", e);
  process.exit(1);
});
