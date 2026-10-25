"use strict";
// Loop Sketch — reine Logik: Templates laden, Roles mappen, To-Arr-Plan bauen.
// Ohne Max/Live-Abhaengigkeiten; mit node:test getestet. Node for Max (Live 11): kein ?. / ??.
//
// Arrangement-Stil (Song Sketch): pro kontinuierlicher aktiver Region EIN Clip in voller
// Abschnittslaenge, der den 8-Takt-Session-Loop loopt — keine 8-Bar-Kacheln × N.

var ROLES = ["kick", "bass", "hats", "perc", "synth", "pad", "fx"];
var ROLE_LABELS = {
  kick: "Kick", bass: "Bass", hats: "Hats", perc: "Perc",
  synth: "Synth", pad: "Pad", fx: "FX",
};
var MENU_AUTO = "Auto";
var MENU_NONE = "Keine";
var DEFAULT_BPM = 145;
var BARS_PER_LOOP = 8;

// Spezifischere Stichworte zuerst. Pad und FX getrennt (Song-Sketch-Style Roles).
var ROLE_KEYWORDS = {
  kick: ["kick", "bd", "bassdrum", "bass drum", "drum"],
  bass: ["bass", "sub", "808", "reese", "303"],
  hats: ["hat", "hh", "hihat", "hi-hat", "closed", "open hat"],
  perc: ["perc", "conga", "bongo", "shaker", "tamb", "tom", "clap", "snare", "rim"],
  synth: ["synth", "lead", "arp", "pluck", "key", "piano", "melod", "stab"],
  pad: ["pad", "chord", "string", "atmo", "atmosphere", "warm"],
  fx: ["fx", "noise", "riser", "sweep", "impact", "sfx", "transition"],
};

function usableTracks(tracks) {
  return (tracks || []).filter(function (t) { return !t.is_foldable; });
}

function scoreTrack(role, name) {
  var n = String(name || "").toLowerCase();
  var words = ROLE_KEYWORDS[role] || [];
  var best = 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (n.indexOf(w) === -1) continue;
    var s = (words.length - i) * 10;
    if (n === w) s += 8;
    else if (n.length <= 16) s += 4;
    if (n.length > 28) s -= 20;
    if (s > best) best = s;
  }
  return best > 0 ? best : 0;
}

function autoMapRoles(roleNames, tracks) {
  var mapping = {};
  var used = {};
  var order = ROLES.filter(function (r) { return roleNames.indexOf(r) !== -1; })
    .concat(roleNames.filter(function (r) { return ROLES.indexOf(r) === -1; }));
  order.sort(function (a, b) {
    var pa = ROLES.indexOf(a);
    var pb = ROLES.indexOf(b);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  order.forEach(function (role) {
    var best = null;
    var bestRank = -1;
    usableTracks(tracks).forEach(function (t) {
      if (used[t.index]) return;
      var s = scoreTrack(role, t.name);
      if (s <= 0) return;
      var rank = s + (t.has_midi_input ? 1000 : 0);
      if (rank > bestRank) { best = t.index; bestRank = rank; }
    });
    mapping[role] = best;
    if (best !== null) used[best] = true;
  });
  return mapping;
}

function menuItemForTrack(t) {
  return (t.index + 1) + ": " + t.name;
}

function menuItems(tracks) {
  return [MENU_AUTO, MENU_NONE].concat(usableTracks(tracks).map(menuItemForTrack));
}

function resolveMapping(roleNames, tracks, overrides) {
  var auto = autoMapRoles(roleNames, tracks);
  var out = {};
  roleNames.forEach(function (role) {
    var o = overrides && overrides[role];
    if (!o || o === MENU_AUTO) { out[role] = auto[role]; return; }
    if (o === MENU_NONE) { out[role] = null; return; }
    var m = String(o).match(/^(\d+):/);
    var idx = m ? parseInt(m[1], 10) - 1 : -1;
    out[role] = (tracks || []).some(function (t) { return t.index === idx; }) ? idx : auto[role];
  });
  return out;
}

function round3(x) { return Math.round(x * 1000) / 1000; }

// Live 11 MxDCore: Namen mit Leerzeichen → oft "Invalid syntax". Underscore ist sicher.
function liveSafeName(name) {
  var s = String(name == null ? "" : name).replace(/\s+/g, "_");
  return s.length ? s : "Loop";
}

function trackByIndex(state, idx) {
  var ts = (state && state.tracks) || [];
  for (var i = 0; i < ts.length; i++) if (ts[i].index === idx) return ts[i];
  return null;
}

// Kanonische Loop-Laenge in Beats: immer ganze 8 Takte (32 Beats bei 4/4), nie kleinere Stuecke.
function canonicalLoopBeats(source, beatsPerBar) {
  var bpb = Number(beatsPerBar) > 0 ? Number(beatsPerBar) : 4;
  var target = BARS_PER_LOOP * bpb;
  var len = source && Number(source.length);
  if (!(len > 0.05) || !isFinite(len)) return target;
  var bars = len / bpb;
  // Nahe 8 Takte → exakt 8. Sonst auf naechstes Vielfaches von 8 Takten (mindestens 8).
  if (Math.abs(bars - BARS_PER_LOOP) <= 0.51) return round3(target);
  var mult = Math.max(1, Math.round(bars / BARS_PER_LOOP));
  return round3(mult * BARS_PER_LOOP * bpb);
}

function validateTemplate(tpl) {
  var errors = [];
  if (!tpl || typeof tpl !== "object") return ["Template ist kein Objekt"];
  if (!tpl.id) errors.push("id fehlt");
  if (!tpl.name) errors.push("name fehlt");
  if (!tpl.genre) errors.push("genre fehlt");
  if (!Array.isArray(tpl.sections) || !tpl.sections.length) errors.push("sections fehlen");
  if (!tpl.roles || typeof tpl.roles !== "object") errors.push("roles fehlen");
  var bpb = Number(tpl.beats_per_bar || 4);
  if (!(bpb > 0)) errors.push("beats_per_bar ungueltig");
  (tpl.sections || []).forEach(function (s, i) {
    if (s.start_bar == null || s.length_bars == null) {
      errors.push("section[" + i + "] braucht start_bar und length_bars");
    }
    if (!(Number(s.length_bars) > 0)) errors.push("section[" + i + "] length_bars muss > 0");
    var lb = Number(s.length_bars);
    if (lb > 0 && lb % BARS_PER_LOOP !== 0) {
      errors.push("section[" + i + "] length_bars muss Vielfaches von " + BARS_PER_LOOP + " sein (ganze 8-Takt-Loops)");
    }
    var sb = Number(s.start_bar);
    if (sb > 0 && sb % BARS_PER_LOOP !== 0) {
      errors.push("section[" + i + "] start_bar muss auf " + BARS_PER_LOOP + "-Takt-Raster liegen");
    }
  });
  ROLES.forEach(function (role) {
    var def = tpl.roles && tpl.roles[role];
    if (!def) {
      errors.push("role '" + role + "' fehlt");
      return;
    }
    if (Array.isArray(def.presence)) {
      if (def.presence.length !== (tpl.sections || []).length) {
        errors.push("role '" + role + "': presence-Laenge != sections");
      }
    } else if (Array.isArray(def.active_bars)) {
      def.active_bars.forEach(function (range, j) {
        if (!Array.isArray(range) || range.length !== 2) {
          errors.push("role '" + role + "' active_bars[" + j + "] muss [start, end) sein");
        }
      });
    } else {
      errors.push("role '" + role + "': presence oder active_bars noetig");
    }
  });
  return errors;
}

function normalizeTemplate(raw) {
  var errors = validateTemplate(raw);
  if (errors.length) {
    var err = new Error("Ungueltiges Template: " + errors.join("; "));
    err.errors = errors;
    throw err;
  }
  var bpb = Number(raw.beats_per_bar || 4);
  var sections = raw.sections.map(function (s) {
    var startBar = Number(s.start_bar);
    var lengthBars = Number(s.length_bars);
    return {
      id: s.id || s.label,
      label: s.label || s.id || "Section",
      start_bar: startBar,
      length_bars: lengthBars,
      end_bar: startBar + lengthBars,
      start_beat: round3(startBar * bpb),
      length_beats: round3(lengthBars * bpb),
    };
  });
  var roles = {};
  ROLES.forEach(function (role) {
    var def = raw.roles[role];
    roles[role] = {
      presence: Array.isArray(def.presence) ? def.presence.map(Boolean) : null,
      active_bars: Array.isArray(def.active_bars)
        ? def.active_bars.map(function (r) { return [Number(r[0]), Number(r[1])]; })
        : null,
    };
  });
  var lengthBars = 0;
  sections.forEach(function (s) {
    if (s.end_bar > lengthBars) lengthBars = s.end_bar;
  });
  return {
    id: String(raw.id),
    name: String(raw.name),
    genre: String(raw.genre),
    bpm_hint: raw.bpm_hint != null ? Number(raw.bpm_hint) : null,
    beats_per_bar: bpb,
    description: raw.description ? String(raw.description) : "",
    sections: sections,
    roles: roles,
    length_bars: lengthBars,
    length_beats: round3(lengthBars * bpb),
  };
}

function loadTemplateFromObject(obj) {
  return normalizeTemplate(obj);
}

function loadTemplateCatalog(indexJson, readFile) {
  var index = typeof indexJson === "string" ? JSON.parse(indexJson) : indexJson;
  var files = (index && index.templates) || [];
  var templates = [];
  files.forEach(function (name) {
    var text = readFile(name);
    var raw = typeof text === "string" ? JSON.parse(text) : text;
    templates.push(normalizeTemplate(raw));
  });
  return templates;
}

function listTemplateMenuItems(templates) {
  return (templates || []).map(function (t) {
    return t.genre + " — " + t.name;
  });
}

function findTemplateByMenu(templates, menuText) {
  var items = listTemplateMenuItems(templates);
  var idx = items.indexOf(String(menuText || ""));
  if (idx >= 0) return templates[idx];
  // Fallback: id oder name
  var key = String(menuText || "").toLowerCase();
  for (var i = 0; i < (templates || []).length; i++) {
    var t = templates[i];
    if (t.id === menuText || t.name === menuText) return t;
    if (String(t.id).toLowerCase() === key) return t;
  }
  return null;
}

function roleActiveInSection(roleDef, sectionIndex, section) {
  if (!roleDef) return true;
  if (roleDef.presence) {
    return roleDef.presence[sectionIndex] !== false;
  }
  if (roleDef.active_bars && section) {
    var start = section.start_bar;
    var end = section.end_bar;
    // Aktiv wenn irgendein Bereich die Section ueberschneidet.
    for (var i = 0; i < roleDef.active_bars.length; i++) {
      var a = roleDef.active_bars[i][0];
      var b = roleDef.active_bars[i][1];
      if (a < end && b > start) return true;
    }
    return false;
  }
  return true;
}

function labelAtBeat(template, beat) {
  for (var i = 0; i < template.sections.length; i++) {
    var sec = template.sections[i];
    var s0 = sec.start_beat;
    var s1 = round3(sec.start_beat + sec.length_beats);
    if (beat >= s0 - 1e-9 && beat < s1 - 1e-9) return sec.label;
  }
  return template.sections.length ? template.sections[template.sections.length - 1].label : "Loop";
}

function pushMergedRegion(regions, start, end, label, sectionIndex) {
  if (!(end > start + 1e-9)) return;
  var last = regions.length ? regions[regions.length - 1] : null;
  if (last && Math.abs(last.end - start) < 1e-6) {
    last.end = end;
    last.length = round3(last.end - last.start);
    if (sectionIndex != null) last.section_indices.push(sectionIndex);
    last.label = label;
  } else {
    regions.push({
      start: start,
      end: end,
      length: round3(end - start),
      section_indices: sectionIndex != null ? [sectionIndex] : [],
      label: label,
    });
  }
}

// Aktive Beat-Intervalle fuer eine Role (zusammengefasst).
// presence → ganze aktive Sections; active_bars → exakte Takt-Intervalle.
function activeRegionsForRole(template, role) {
  var roleDef = template.roles[role];
  var regions = [];
  var bpb = template.beats_per_bar;
  if (roleDef && roleDef.active_bars) {
    roleDef.active_bars.forEach(function (range) {
      var start = round3(Number(range[0]) * bpb);
      var end = round3(Number(range[1]) * bpb);
      pushMergedRegion(regions, start, end, labelAtBeat(template, start), null);
    });
    return regions;
  }
  template.sections.forEach(function (section, i) {
    if (!roleActiveInSection(roleDef, i, section)) return;
    var start = section.start_beat;
    var end = round3(section.start_beat + section.length_beats);
    pushMergedRegion(regions, start, end, section.label, i);
  });
  return regions;
}

// Eine Region → ein Arrangement-Clip (volle Region-Laenge). Loop-Klammer = 8-Takt-Quelle.
// Kein Zerhacken in Dutzende identische 8-Bar-Duplikate.
function buildRoleTiles(template, role, source) {
  var regions = activeRegionsForRole(template, role);
  var tiles = [];
  var loopLen = canonicalLoopBeats(source, template.beats_per_bar);
  if (!source) return { tiles: tiles, regions: regions, loop_length: 0 };
  regions.forEach(function (region) {
    var len = round3(region.length);
    if (!(len > 0.05)) return;
    // Region-Label: erste Section der zusammengefassten Region (Start).
    var label = region.label;
    for (var si = 0; si < template.sections.length; si++) {
      var sec = template.sections[si];
      var s0 = sec.start_beat;
      var s1 = round3(sec.start_beat + sec.length_beats);
      if (region.start >= s0 - 1e-9 && region.start < s1 - 1e-9) {
        label = sec.label;
        break;
      }
    }
    tiles.push({
      start: round3(region.start),
      length: len,
      name: liveSafeName(label),
      color_index: source.color_index,
      source_kind: source.kind || "session",
      source_index: source.index != null ? source.index : 0,
      source_length: source.length,
      loop_length: loopLen,
    });
  });
  return {
    tiles: tiles,
    regions: regions,
    loop_length: loopLen,
  };
}

// Scene-1-Clip der Spur (Slot-Index 0). Kein Arrangement-Fallback.
function scene1Source(track) {
  if (!track) return null;
  if (track.scene1_clip) return track.scene1_clip;
  // Fallback: source_loop nur wenn Session Slot 0
  var src = track.source_loop;
  if (src && src.kind === "session" && Number(src.index) === 0) return src;
  return null;
}

function buildPlan(template, state, mapping, options) {
  // Standard: Tempo immer 145 (Musik ausschliesslich 145 BPM). set_tempo:false unterdrueckt.
  var opts = Object.assign({ set_tempo: true, tempo: DEFAULT_BPM }, options || {});
  var plan = {
    template_id: template.id,
    template_name: template.name,
    tempo: null,
    locators: [],
    tracks: [],
    warnings: [],
    length_beats: template.length_beats,
    length_bars: template.length_bars,
  };
  if (opts.set_tempo !== false) {
    var bpm = opts.tempo != null ? Number(opts.tempo) : DEFAULT_BPM;
    if (!(bpm >= 20 && bpm <= 999)) bpm = DEFAULT_BPM;
    plan.tempo = bpm;
  }
  plan.locators = template.sections.map(function (s) {
    return { time: s.start_beat, name: liveSafeName(s.label) };
  });

  ROLES.forEach(function (role) {
    var idx = mapping ? mapping[role] : null;
    if (idx === null || idx === undefined) return;
    var track = trackByIndex(state, idx);
    var label = ROLE_LABELS[role] || role;
    if (!track) {
      plan.warnings.push("Spur " + (idx + 1) + " fuer " + label + " existiert nicht mehr.");
      return;
    }
    var source = scene1Source(track);
    if (!source) {
      plan.warnings.push("'" + track.name + "' (" + label + "): kein Clip in Session-Szene 1. Spur ohne Arrangement-Clips.");
      return;
    }
    var tiled = buildRoleTiles(template, role, source);
    if (!tiled.tiles.length) {
      plan.warnings.push("'" + track.name + "' (" + label + "): Role in keiner Section aktiv.");
      return;
    }
    var coverage = tiled.tiles.reduce(function (s, c) { return s + c.length; }, 0);
    plan.tracks.push({
      track: idx,
      name: track.name,
      role: role,
      source_loop: source,
      coverage_beats: round3(coverage),
      length_beats: template.length_beats,
      clips: tiled.tiles,
    });
  });
  return plan;
}

function planStats(plan) {
  var clips = 0;
  (plan.tracks || []).forEach(function (t) { clips += t.clips.length; });
  return { locators: (plan.locators || []).length, clips: clips, tracks: (plan.tracks || []).length };
}

function formatSummary(template, mapping, state) {
  var lines = [];
  lines.push(template.genre + " — " + template.name +
    (template.bpm_hint ? " (" + template.bpm_hint + " BPM)" : "") +
    ", " + template.length_bars + " Takte / " + template.length_beats + " Beats");
  if (template.description) lines.push(template.description);
  lines.push("Abschnitte:");
  template.sections.forEach(function (s) {
    lines.push("  T" + (s.start_bar + 1) + "-" + s.end_bar + "  " + s.label);
  });
  if (mapping) {
    lines.push("Zuordnung (Quelle = Session-Szene 1):");
    ROLES.forEach(function (role) {
      var tr = mapping[role] === null || mapping[role] === undefined
        ? null : trackByIndex(state, mapping[role]);
      var src = scene1Source(tr);
      var loop = src
        ? " [Szene1, " + Math.round(src.length) + " Beats, Farbe " + src.color_index + "]"
        : (tr ? " [kein Clip in Szene 1]" : "");
      var active = activeRegionsForRole(template, role).length;
      lines.push("  " + (ROLE_LABELS[role] || role) + " -> " +
        (tr ? menuItemForTrack(tr) : "-") + loop +
        " (" + active + " aktive Region" + (active === 1 ? "" : "en") + ")");
    });
  }
  return lines.join("\n");
}

module.exports = {
  ROLES: ROLES,
  ROLE_LABELS: ROLE_LABELS,
  ROLE_KEYWORDS: ROLE_KEYWORDS,
  MENU_AUTO: MENU_AUTO,
  MENU_NONE: MENU_NONE,
  DEFAULT_BPM: DEFAULT_BPM,
  BARS_PER_LOOP: BARS_PER_LOOP,
  scoreTrack: scoreTrack,
  autoMapRoles: autoMapRoles,
  resolveMapping: resolveMapping,
  menuItems: menuItems,
  menuItemForTrack: menuItemForTrack,
  trackByIndex: trackByIndex,
  liveSafeName: liveSafeName,
  canonicalLoopBeats: canonicalLoopBeats,
  validateTemplate: validateTemplate,
  normalizeTemplate: normalizeTemplate,
  loadTemplateFromObject: loadTemplateFromObject,
  loadTemplateCatalog: loadTemplateCatalog,
  listTemplateMenuItems: listTemplateMenuItems,
  findTemplateByMenu: findTemplateByMenu,
  roleActiveInSection: roleActiveInSection,
  activeRegionsForRole: activeRegionsForRole,
  buildRoleTiles: buildRoleTiles,
  scene1Source: scene1Source,
  buildPlan: buildPlan,
  planStats: planStats,
  formatSummary: formatSummary,
};
