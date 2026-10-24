"use strict";
// Reine Logik des Reference Rebuilders (ohne Max/Live-Abhaengigkeiten, mit node:test getestet).
// Kompatibel mit dem Node von Node for Max in Live 11 (kein ?. / ??).

var STEMS = ["drums", "bass", "other", "vocals"];
var MENU_AUTO = "Auto";
var MENU_NONE = "Keine";

var STEM_KEYWORDS = {
  drums: ["drum", "kick", "snare", "hat", "perc", "beat", "clap", "schlagzeug", "top", "loop"],
  bass: ["bass", "sub", "808", "reese"],
  vocals: ["vocal", "vox", "voc", "gesang", "stimme", "sing", "acapella", "chant"],
  other: ["synth", "lead", "pad", "chord", "key", "piano", "guitar", "gitarre", "arp", "pluck", "string", "other", "melod", "fx"],
};

var DEVICE_CLASS = { "Auto Filter": "AutoFilter", Utility: "StereoGain" };
var NEUTRAL = { filter_cutoff: 20000, gain: 0 };

// Max liefert Pfade teils als "Macintosh HD:/Users/x/a.mp3".
function toPosixPath(maxPath, exists) {
  var p = String(maxPath || "").trim().replace(/^"|"$/g, "");
  var m = p.match(/^([^/:]+):(\/.*)$/);
  if (!m) return p;
  var rootCandidate = m[2];
  var volumeCandidate = "/Volumes/" + m[1] + m[2];
  if (exists && !exists(rootCandidate) && exists(volumeCandidate)) return volumeCandidate;
  return rootCandidate;
}

function usableTracks(tracks) {
  return (tracks || []).filter(function (t) { return !t.is_foldable; });
}

function scoreTrack(stem, name) {
  var n = String(name || "").toLowerCase();
  var words = STEM_KEYWORDS[stem] || [];
  for (var i = 0; i < words.length; i++) {
    if (n.indexOf(words[i]) !== -1) return words.length - i;
  }
  return 0;
}

// Automatische Zuordnung Stem -> Spurindex nach Spurnamen (jede Spur hoechstens einmal).
function autoMapStems(stemNames, tracks) {
  var mapping = {};
  var used = {};
  var order = STEMS.filter(function (s) { return stemNames.indexOf(s) !== -1; })
    .concat(stemNames.filter(function (s) { return STEMS.indexOf(s) === -1; }));
  // "other" zuletzt: seine Stichworte sind am unspezifischsten.
  order.sort(function (a, b) { return (a === "other") - (b === "other"); });
  order.forEach(function (stem) {
    var best = null;
    var bestScore = 0;
    usableTracks(tracks).forEach(function (t) {
      if (used[t.index]) return;
      var s = scoreTrack(stem, t.name);
      if (s > bestScore) { best = t.index; bestScore = s; }
    });
    mapping[stem] = best;
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

// overrides: { stem: Menuetext } -> endgueltige Zuordnung { stem: index|null }
function resolveMapping(stemNames, tracks, overrides) {
  var auto = autoMapStems(stemNames, tracks);
  var out = {};
  stemNames.forEach(function (stem) {
    var o = overrides && overrides[stem];
    if (!o || o === MENU_AUTO) { out[stem] = auto[stem]; return; }
    if (o === MENU_NONE) { out[stem] = null; return; }
    var m = String(o).match(/^(\d+):/);
    var idx = m ? parseInt(m[1], 10) - 1 : -1;
    out[stem] = (tracks || []).some(function (t) { return t.index === idx; }) ? idx : auto[stem];
  });
  return out;
}

// "1.20 kHz" -> 1200, "500 Hz" -> 500, "-6.0 dB" -> -6, "-inf dB" -> -Infinity
function parseDisplayValue(text, unit) {
  var s = String(text || "").trim().replace(",", ".");
  if (/^-?inf/i.test(s)) return s.charAt(0) === "-" ? -Infinity : Infinity;
  var m = s.match(/^(-?\d+(?:\.\d+)?)\s*(k?)(hz|db)?/i);
  if (!m) return null;
  var v = parseFloat(m[1]);
  if (m[2] && m[2].toLowerCase() === "k") v *= 1000;
  if (unit === "Hz" && m[3] && m[3].toLowerCase() !== "hz") return null;
  if (unit === "dB" && m[3] && m[3].toLowerCase() !== "db") return null;
  return v;
}

// samples: [[rawValue, displayString], ...] (aufsteigend nach rawValue) -> Funktion Einheit -> Rohwert.
// Interpoliert bei Hz logarithmisch, bei dB linear; ausserhalb des Bereichs wird geklemmt.
function buildInverseMap(samples, unit) {
  var pts = [];
  (samples || []).forEach(function (s) {
    var v = parseDisplayValue(s[1], unit);
    if (v === null || !isFinite(v)) return;
    pts.push({ raw: Number(s[0]), val: unit === "Hz" ? Math.log(Math.max(v, 1e-6)) : v });
  });
  pts.sort(function (a, b) { return a.raw - b.raw; });
  var mono = [];
  pts.forEach(function (p) {
    if (!mono.length || p.val > mono[mono.length - 1].val) mono.push(p);
  });
  if (mono.length < 2) return null;
  return function (target) {
    var t = unit === "Hz" ? Math.log(Math.max(target, 1e-6)) : target;
    if (t <= mono[0].val) return mono[0].raw;
    if (t >= mono[mono.length - 1].val) return mono[mono.length - 1].raw;
    for (var i = 1; i < mono.length; i++) {
      if (t <= mono[i].val) {
        var a = mono[i - 1];
        var b = mono[i];
        return a.raw + (b.raw - a.raw) * (t - a.val) / (b.val - a.val);
      }
    }
    return mono[mono.length - 1].raw;
  };
}

function valueAt(points, beat) {
  var v = points.length ? points[0].value : null;
  for (var i = 0; i < points.length; i++) {
    if (points[i].beat <= beat + 1e-9) v = points[i].value; else break;
  }
  return v;
}

// Breakpoints (Treppenkurve) -> Schritte [zeit, dauer, wert] relativ zum Abschnittsanfang.
function sliceAutomation(points, startBeat, lengthBeats) {
  if (!points || !points.length) return [];
  var end = startBeat + lengthBeats;
  var times = [startBeat];
  var values = [valueAt(points, startBeat)];
  points.forEach(function (p) {
    if (p.beat > startBeat + 1e-9 && p.beat < end - 1e-9) {
      if (p.value !== values[values.length - 1]) {
        times.push(p.beat);
        values.push(p.value);
      }
    }
  });
  var steps = [];
  for (var i = 0; i < times.length; i++) {
    var t1 = i + 1 < times.length ? times[i + 1] : end;
    steps.push([round3(times[i] - startBeat), round3(t1 - times[i]), values[i]]);
  }
  return steps;
}

function round3(x) { return Math.round(x * 1000) / 1000; }

function isNeutral(target, steps) {
  var neutral = NEUTRAL[target];
  return steps.every(function (s) {
    return target === "filter_cutoff" ? s[2] >= neutral * 0.98 : s[2] >= neutral - 0.5;
  });
}

function findDevice(track, className) {
  var devs = (track && track.devices) || [];
  for (var i = 0; i < devs.length; i++) if (devs[i].class_name === className) return devs[i];
  return null;
}

function findParam(params, name) {
  var lower = String(name).toLowerCase();
  var exact = null;
  var prefix = null;
  (params || []).forEach(function (p) {
    var n = String(p.name).toLowerCase();
    if (n === lower && !exact) exact = p;
    else if (!prefix && (n.indexOf(lower) === 0 || lower.indexOf(n) === 0) && n.length >= 4) prefix = p;
  });
  return exact || prefix;
}

function trackByIndex(state, idx) {
  var ts = (state && state.tracks) || [];
  for (var i = 0; i < ts.length; i++) if (ts[i].index === idx) return ts[i];
  return null;
}

var GROUP_COLORS = { A: 14, B: 26, C: 5, D: 19, E: 9, F: 22 };

// Plan aus Analyse + Live-Zustand + Optionen. Enthaelt Werte noch in Hz/dB; die Umrechnung in
// Parameter-Rohwerte passiert beim Ausfuehren (braucht str_for_value aus Live).
function buildPlan(analysis, state, options, mapping) {
  var opts = Object.assign({ build_arrangement: true, apply_automation: true, set_tempo: true }, options || {});
  var sections = analysis.sections || [];
  var plan = { tempo: null, locators: [], tracks: [], devices: [], warnings: [] };
  if (opts.build_arrangement) {
    if (opts.set_tempo && analysis.tempo) plan.tempo = analysis.tempo.bpm;
    plan.locators = sections.map(function (s) { return { time: s.start_beat, name: s.label }; });
  }
  (analysis.stems || []).forEach(function (stem) {
    var idx = mapping ? mapping[stem.name] : null;
    if (idx === null || idx === undefined) return;
    var track = trackByIndex(state, idx);
    if (!track) {
      plan.warnings.push("Spur " + (idx + 1) + " fuer " + stem.name + " existiert nicht mehr.");
      return;
    }
    var automation = opts.apply_automation ? (stem.automation || []) : [];
    automation.forEach(function (a) {
      var cls = a.class_name || DEVICE_CLASS[a.device];
      if (!plan.devices.some(function (d) { return d.track === idx && d.class_name === cls; })) {
        plan.devices.push({ track: idx, device: a.device, class_name: cls, present: !!findDevice(track, cls) });
      }
    });
    if (!track.has_midi_input && (opts.build_arrangement || automation.length)) {
      plan.warnings.push("'" + track.name + "' ist eine Audiospur: Live 11 kann dort keine leeren Clips anlegen. " +
        "Clip-Geruest/Automation nur auf MIDI-Spuren (Effekte werden trotzdem eingefuegt).");
      return;
    }
    var clips = [];
    sections.forEach(function (s, i) {
      var envs = automation.map(function (a) {
        return { target: a.target, device: a.device, class_name: a.class_name || DEVICE_CLASS[a.device],
          parameter: a.parameter, unit: a.unit, steps: sliceAutomation(a.points, s.start_beat, s.length_beats) };
      });
      var active = !stem.active_sections || stem.active_sections[i] !== false;
      var needed = (opts.build_arrangement && active) ||
        envs.some(function (e) { return !isNeutral(e.target, e.steps); });
      if (!needed) return;
      clips.push({ section: i, start: s.start_beat, length: s.length_beats, name: s.label,
        color_index: GROUP_COLORS[s.group] !== undefined ? GROUP_COLORS[s.group] : null, envelopes: envs });
    });
    if (clips.length) plan.tracks.push({ track: idx, name: track.name, stem: stem.name, clips: clips });
  });
  return plan;
}

function planStats(plan) {
  var clips = 0;
  var envs = 0;
  plan.tracks.forEach(function (t) {
    clips += t.clips.length;
    t.clips.forEach(function (c) { envs += c.envelopes.length; });
  });
  return { locators: plan.locators.length, clips: clips, envelopes: envs,
    devices_missing: plan.devices.filter(function (d) { return !d.present; }).length };
}

function formatSummary(analysis, mapping, state) {
  var lines = [];
  var t = analysis.tempo || {};
  lines.push("Tempo " + t.bpm + " BPM (Konfidenz " + Math.round((t.confidence || 0) * 100) + "%), " +
    t.num_bars + " Takte, Stems: " + analysis.separation);
  lines.push("Songteile:");
  (analysis.sections || []).forEach(function (s) {
    lines.push("  T" + (s.start_bar + 1) + "-" + s.end_bar + "  " + s.label + " [" + s.group + "]");
  });
  if (mapping) {
    lines.push("Zuordnung:");
    Object.keys(mapping).forEach(function (stem) {
      var tr = mapping[stem] === null ? null : trackByIndex(state, mapping[stem]);
      lines.push("  " + stem + " -> " + (tr ? menuItemForTrack(tr) : "-"));
    });
  }
  if ((analysis.suggested_devices || []).length) {
    lines.push("Vorschlaege:");
    analysis.suggested_devices.forEach(function (d) { lines.push("  " + d.stem + ": " + d.device + " - " + d.reason); });
  }
  (analysis.hints || []).forEach(function (h) { lines.push("Hinweis: " + h.message); });
  (analysis.warnings || []).forEach(function (w) { lines.push("Warnung: " + w); });
  return lines.join("\n");
}

module.exports = {
  STEMS: STEMS,
  MENU_AUTO: MENU_AUTO,
  MENU_NONE: MENU_NONE,
  DEVICE_CLASS: DEVICE_CLASS,
  toPosixPath: toPosixPath,
  autoMapStems: autoMapStems,
  resolveMapping: resolveMapping,
  menuItems: menuItems,
  parseDisplayValue: parseDisplayValue,
  buildInverseMap: buildInverseMap,
  sliceAutomation: sliceAutomation,
  isNeutral: isNeutral,
  findDevice: findDevice,
  findParam: findParam,
  trackByIndex: trackByIndex,
  buildPlan: buildPlan,
  planStats: planStats,
  formatSummary: formatSummary,
};
