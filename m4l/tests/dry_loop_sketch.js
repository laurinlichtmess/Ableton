"use strict";
// Dry-run: Template → Plan → place_loop gegen Fake-LOM (ohne Ableton).
// Aufruf: node m4l/tests/dry_loop_sketch.js

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var FakeLive = require("./fake_lom").FakeLive;
var core = require("../js/ls_core");
var Orchestrator = require("../js/ls_orchestrator").Orchestrator;

var TEMPLATES = path.join(__dirname, "..", "..", "templates");

function loadTemplates() {
  var index = JSON.parse(fs.readFileSync(path.join(TEMPLATES, "index.json"), "utf8"));
  return core.loadTemplateCatalog(index, function (name) {
    return fs.readFileSync(path.join(TEMPLATES, name), "utf8");
  });
}

async function main() {
  var templates = loadTemplates();
  console.log("Templates:", templates.map(function (t) { return t.id; }).join(", "));

  var live = new FakeLive();
  live.addScene();
  var roles = [
    ["Kick", 12], ["Bass", 20], ["Hats", 8], ["Perc", 30],
    ["Synth Lead", 14], ["Pad", 55], ["FX Riser", 3],
  ];
  roles.forEach(function (r) {
    var tr = live.addTrack(r[0], true);
    tr.clip_slots[0].clip = live.makeClip({
      name: r[0] + " loop", length: 32, color_index: r[1],
      notes: [[0, 0.5, 60, 100]],
    });
  });
  var bridge = live.loadBridge();
  var ui = { status: function (t) { console.log("  status:", t); }, summary: function () {},
    menu: function () {}, templateMenu: function () {} };
  var orch = new Orchestrator({ lom: bridge.lom, ui: ui, templates: templates });
  await orch.refreshTracks();
  orch.setTemplateByMenu("Techno — Techno Warehouse");

  var plan = orch.buildPlan();
  var stats = core.planStats(plan);
  console.log("Plan:", stats.tracks, "Spuren,", stats.clips, "Abschnitts-Clips,", stats.locators, "Locators, tempo", plan.tempo);
  assert.ok(stats.clips > 0);
  assert.ok(stats.clips < 30, "keine Dutzende 8-Bar-Kacheln — Abschnitts-Clips erwartet");
  assert.equal(plan.tempo, 145);

  var report = await orch.toArr();
  assert.ok(report.clips > 0);
  assert.ok(report.locators >= 6);
  assert.equal(report.tempo, 145);

  var kick = live.song.tracks[0];
  var cover = kick.arrangement_clips.reduce(function (s, c) { return s + c.length; }, 0);
  console.log("Kick arrangement clips:", kick.arrangement_clips.length, "cover beats:", cover);
  assert.equal(kick.arrangement_clips.length, 2, "Kick: 2 Regionen, nicht 14 Kacheln");
  assert.ok(kick.arrangement_clips.every(function (c) { return c.color_index === 12; }));
  assert.ok(kick.arrangement_clips.every(function (c) { return c.notes && c.notes.length > 0; }));
  assert.ok(kick.arrangement_clips.every(function (c) {
    return c.looping === 1 && (c.loop_end - c.loop_start) === 32 && c.length > 32;
  }));

  // Hats durchgehend aktiv → genau 1 Clip ueber volle Template-Laenge
  var hats = live.song.tracks[2];
  assert.equal(hats.arrangement_clips.length, 1);
  assert.equal(hats.arrangement_clips[0].length, plan.length_beats);

  console.log("\nDRY OK — section-clips+8bar-loop-brace+145bpm+locators+colors");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
