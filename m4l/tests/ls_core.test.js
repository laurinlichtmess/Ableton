"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var core = require("../js/ls_core");

var TEMPLATES = path.join(__dirname, "..", "..", "templates");

function loadAll() {
  var index = JSON.parse(fs.readFileSync(path.join(TEMPLATES, "index.json"), "utf8"));
  return core.loadTemplateCatalog(index, function (name) {
    return fs.readFileSync(path.join(TEMPLATES, name), "utf8");
  });
}

test("Katalog: Techno×3, House×2, Tech House×1", function () {
  var templates = loadAll();
  assert.equal(templates.length, 6);
  var byGenre = {};
  templates.forEach(function (t) {
    byGenre[t.genre] = (byGenre[t.genre] || 0) + 1;
    assert.ok(t.length_beats > 0);
    assert.equal(Object.keys(t.roles).sort().join(","), core.ROLES.slice().sort().join(","));
  });
  assert.equal(byGenre.Techno, 3);
  assert.equal(byGenre.House, 2);
  assert.equal(byGenre["Tech House"], 1);
});

test("validateTemplate lehnt kaputte Presence ab", function () {
  var raw = JSON.parse(fs.readFileSync(path.join(TEMPLATES, "techno-peak.json"), "utf8"));
  raw.roles.kick.presence = [true];
  var errs = core.validateTemplate(raw);
  assert.ok(errs.some(function (e) { return /presence-Laenge/.test(e); }));
});

test("Auto-Map nach Spurnamen", function () {
  var tracks = [
    { index: 0, name: "Kick MIDI", has_midi_input: true, is_foldable: false },
    { index: 1, name: "Bass", has_midi_input: true, is_foldable: false },
    { index: 2, name: "Hats", has_midi_input: true, is_foldable: false },
    { index: 3, name: "Pad Warm", has_midi_input: true, is_foldable: false },
    { index: 4, name: "FX Riser", has_midi_input: false, is_foldable: false },
    { index: 5, name: "Group", has_midi_input: false, is_foldable: true },
  ];
  var map = core.autoMapRoles(core.ROLES, tracks);
  assert.equal(map.kick, 0);
  assert.equal(map.bass, 1);
  assert.equal(map.hats, 2);
  assert.equal(map.pad, 3);
  assert.equal(map.fx, 4);
});

test("activeRegions fasst benachbarte Sections zusammen", function () {
  var tpl = core.loadTemplateFromObject({
    id: "t", name: "T", genre: "Techno", beats_per_bar: 4,
    sections: [
      { id: "a", label: "A", start_bar: 0, length_bars: 8 },
      { id: "b", label: "B", start_bar: 8, length_bars: 8 },
      { id: "c", label: "C", start_bar: 16, length_bars: 8 },
    ],
    roles: {
      kick: { presence: [true, true, false] },
      bass: { presence: [false, false, false] },
      hats: { presence: [true, false, true] },
      perc: { presence: [false, false, false] },
      synth: { presence: [false, false, false] },
      pad: { presence: [false, false, false] },
      fx: { presence: [false, false, false] },
    },
  });
  var kick = core.activeRegionsForRole(tpl, "kick");
  assert.equal(kick.length, 1);
  assert.equal(kick[0].start, 0);
  assert.equal(kick[0].end, 64); // 16 bars * 4
  var hats = core.activeRegionsForRole(tpl, "hats");
  assert.equal(hats.length, 2);
  assert.equal(hats[0].start, 0);
  assert.equal(hats[0].end, 32);
  assert.equal(hats[1].start, 64);
  assert.equal(hats[1].end, 96);
});

test("buildRoleTiles kachelt 8-Bar-Loop nur in aktiven Regionen", function () {
  var templates = loadAll();
  var tpl = templates.find(function (t) { return t.id === "techno-peak"; });
  assert.ok(tpl);
  var source = { kind: "session", index: 0, length: 32, color_index: 12, name: "kick loop" };
  var tiled = core.buildRoleTiles(tpl, "kick", source);
  // Kick inactive in Break (bars 56-72 = beats 224-288)
  var inBreak = tiled.tiles.filter(function (c) {
    return c.start >= 224 - 1e-6 && c.start < 288 - 1e-6;
  });
  assert.equal(inBreak.length, 0, "keine Kick-Kacheln im Break");
  var cover = tiled.tiles.reduce(function (s, c) { return s + c.length; }, 0);
  // Total 112 bars = 448 beats; break 16 bars = 64 beats → 384 active
  assert.equal(cover, 384);
  tiled.tiles.forEach(function (c) {
    assert.equal(c.color_index, 12);
    assert.equal(c.source_kind, "session");
    assert.equal(c.source_index, 0);
    assert.ok(c.length <= 32);
  });
});

test("buildPlan: Mapping + Scene-1 → Locators und Clips", function () {
  var templates = loadAll();
  var tpl = templates.find(function (t) { return t.id === "house-classic"; });
  var state = {
    tracks: [
      { index: 0, name: "Kick", has_midi_input: true, is_foldable: false,
        scene1_clip: { kind: "session", index: 0, length: 32, color_index: 1, name: "k" } },
      { index: 1, name: "Bass", has_midi_input: true, is_foldable: false,
        scene1_clip: { kind: "session", index: 0, length: 32, color_index: 5, name: "b" } },
      { index: 2, name: "Hats", has_midi_input: true, is_foldable: false,
        scene1_clip: { kind: "session", index: 0, length: 16, color_index: 7, name: "h" } },
    ],
  };
  var mapping = { kick: 0, bass: 1, hats: 2, perc: null, synth: null, pad: null, fx: null };
  var plan = core.buildPlan(tpl, state, mapping, {});
  assert.equal(plan.locators.length, tpl.sections.length);
  assert.equal(plan.locators[0].name, "Intro");
  assert.equal(plan.tracks.length, 3);
  var kick = plan.tracks.find(function (t) { return t.role === "kick"; });
  assert.ok(kick.clips.length > 0);
  // Break: kick presence false → keine Clips in Break-Region
  var breakSec = tpl.sections.find(function (s) { return s.id === "break"; });
  var inBreak = kick.clips.filter(function (c) {
    return c.start >= breakSec.start_beat - 1e-6 &&
      c.start < breakSec.start_beat + breakSec.length_beats - 1e-6;
  });
  assert.equal(inBreak.length, 0);
});

test("buildPlan warnt ohne Scene-1-Clip", function () {
  var templates = loadAll();
  var tpl = templates[0];
  var state = {
    tracks: [
      { index: 0, name: "Kick", has_midi_input: true, is_foldable: false, scene1_clip: null, source_loop: null },
    ],
  };
  var plan = core.buildPlan(tpl, state, { kick: 0 }, {});
  assert.equal(plan.tracks.length, 0);
  assert.ok(plan.warnings.some(function (w) { return /Szene 1/.test(w); }));
});

test("active_bars Alternative zu presence (exakte Takt-Intervalle)", function () {
  var tpl = core.loadTemplateFromObject({
    id: "bars", name: "Bars", genre: "Techno", beats_per_bar: 4,
    sections: [
      { id: "a", label: "A", start_bar: 0, length_bars: 16 },
      { id: "b", label: "B", start_bar: 16, length_bars: 16 },
    ],
    roles: {
      kick: { active_bars: [[0, 16]] },
      bass: { active_bars: [[8, 32]] },
      hats: { presence: [true, true] },
      perc: { presence: [false, false] },
      synth: { presence: [false, false] },
      pad: { presence: [false, false] },
      fx: { presence: [false, false] },
    },
  });
  var kick = core.activeRegionsForRole(tpl, "kick");
  assert.equal(kick.length, 1);
  assert.equal(kick[0].start, 0);
  assert.equal(kick[0].end, 64);
  var bass = core.activeRegionsForRole(tpl, "bass");
  assert.equal(bass.length, 1);
  assert.equal(bass[0].start, 32); // bar 8
  assert.equal(bass[0].end, 128);  // bar 32
});
