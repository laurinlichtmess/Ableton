"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
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

function setup() {
  var live = new FakeLive();
  live.addScene();
  live.addScene();
  var kick = live.addTrack("Kick", true);
  var bass = live.addTrack("Bass", true);
  var hats = live.addTrack("Hats", true);
  var pad = live.addTrack("Pad", true);
  kick.clip_slots[0].clip = live.makeClip({ name: "kick8", length: 32, color_index: 12, notes: [[0, 0.5, 36, 100]] });
  bass.clip_slots[0].clip = live.makeClip({ name: "bass8", length: 32, color_index: 20, notes: [[0, 1, 40, 90]] });
  hats.clip_slots[0].clip = live.makeClip({ name: "hats8", length: 32, color_index: 8, notes: [[0, 0.25, 42, 80]] });
  pad.clip_slots[0].clip = live.makeClip({ name: "pad8", length: 32, color_index: 55, notes: [[0, 4, 60, 70]] });
  var bridge = live.loadBridge();

  var ui = {
    statusText: "",
    summaryText: "",
    menus: {},
    templateItems: [],
    status: function (t) { this.statusText = t; },
    summary: function (t) { this.summaryText = t; },
    menu: function (role, items, sel) { this.menus[role] = { items: items, sel: sel }; },
    templateMenu: function (items, sel) { this.templateItems = items; this.templateSel = sel; },
  };

  var orch = new Orchestrator({
    lom: bridge.lom,
    ui: ui,
    templates: loadTemplates(),
  });
  return { live: live, bridge: bridge, orch: orch, ui: ui };
}

test("get_state liefert scene1_clip", function () {
  var s = setup();
  var state = s.bridge.raw({ req: 1, op: "get_state" });
  assert.equal(state.ok, true);
  assert.ok(state.result.tracks[0].scene1_clip);
  assert.equal(state.result.tracks[0].scene1_clip.index, 0);
  assert.equal(state.result.tracks[0].scene1_clip.color_index, 12);
});

test("To Arr dry-run: Kacheln + Locators + Farben aus Szene 1", async function () {
  var s = setup();
  await s.orch.refreshTracks();
  s.orch.setTemplateByMenu("Techno — Techno Peak Time");
  var report = await s.orch.toArr();
  assert.ok(report);
  assert.ok(report.locators >= 6);
  assert.ok(report.clips > 0);

  var kick = s.live.song.tracks[0];
  assert.ok(kick.arrangement_clips.length >= 2);
  kick.arrangement_clips.forEach(function (c) {
    assert.equal(c.color_index, 12);
    assert.ok(c.notes && c.notes.length > 0);
  });
  // Break bei Beat 224–288: keine Kick-Clips
  var inBreak = kick.arrangement_clips.filter(function (c) {
    return c.start_time >= 224 - 0.05 && c.start_time < 288 - 0.05;
  });
  assert.equal(inBreak.length, 0);

  var cues = s.live.song.cue_points.map(function (c) { return c.name; });
  assert.ok(cues.indexOf("Intro") >= 0);
  assert.ok(cues.indexOf("Drop A") >= 0);
  assert.ok(cues.indexOf("Break") >= 0);
});

test("To Arr ohne Scene-1-Clip → Hinweis, keine Clips auf der Spur", async function () {
  var s = setup();
  s.live.song.tracks[0].clip_slots[0].clip = null;
  await s.orch.refreshTracks();
  s.orch.setOverride("kick", "1: Kick");
  s.orch.setOverride("bass", "Keine");
  s.orch.setOverride("hats", "Keine");
  s.orch.setOverride("pad", "Keine");
  s.orch.setOverride("perc", "Keine");
  s.orch.setOverride("synth", "Keine");
  s.orch.setOverride("fx", "Keine");
  var result = await s.orch.toArr();
  assert.equal(result, false);
  assert.ok(/keine clips|kein clip|szene/i.test(s.ui.statusText));
});
