"use strict";
// Reine Logik des Reference Rebuilders (ohne Max/Live-Abhaengigkeiten, mit node:test getestet).
// Kompatibel mit dem Node von Node for Max in Live 11 (kein ?. / ??).

// Feine Elemente (= Analyse-Stems). Reihenfolge = Menue-Reihenfolge im Device.
var STEMS = ["kick", "bass", "clap", "hats", "ride", "perc", "atmo", "synth", "vocals"];
var STEM_LABELS = {
  kick: "Kick", bass: "Bass", clap: "Clap", hats: "Hats", ride: "Ride",
  perc: "Perc", atmo: "Atmo", synth: "Synth", vocals: "Vocals",
};
var MENU_AUTO = "Auto";
var MENU_NONE = "Keine";

// Spezifischere Stichworte zuerst (hoeherer Score). "drum" ist Fallback fuer Kick.
// Kein generisches "loop" – lange Audio-Sample-Namen stehlen sonst MIDI-Spuren.
var STEM_KEYWORDS = {
  kick: ["kick", "bd", "bassdrum", "bass drum", "drum"],
  bass: ["bass", "sub", "808", "reese", "303"],
  clap: ["clap", "snare", "sd", "rim"],
  hats: ["hat", "hh", "hihat", "hi-hat", "closed"],
  ride: ["ride", "cymbal", "crash"],
  perc: ["perc", "conga", "bongo", "shaker", "tamb", "tom"],
  atmo: ["atmo", "pad", "chord", "string", "atmosphere", "fx", "noise"],
  synth: ["synth", "lead", "arp", "pluck", "key", "piano", "melod", "stab"],
  vocals: ["vocal", "vox", "voc", "gesang", "stimme", "sing", "acapella", "chant"],
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

// Stichwort-Treffer; kurze Spurnamen ("kick", "drums") schlagen lange Audio-Sample-Namen.
function scoreTrack(stem, name) {
  var n = String(name || "").toLowerCase();
  var words = STEM_KEYWORDS[stem] || [];
  var best = 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (n.indexOf(w) === -1) continue;
    var s = (words.length - i) * 10;
    if (n === w) s += 8;
    else if (n.length <= 16) s += 4;
    if (n.length > 28) s -= 20; // z. B. "24-seedj_drum_loop_corp-hats_132"
    if (s > best) best = s;
  }
  return best > 0 ? best : 0;
}

// Automatische Zuordnung Element -> Spurindex nach Spurnamen (jede Spur hoechstens einmal).
// MIDI-Spuren gewinnen gegen Audiospuren: Arrangement-Clips gehen in Live 11 nur auf MIDI.
function autoMapStems(stemNames, tracks) {
  var mapping = {};
  var used = {};
  var order = STEMS.filter(function (s) { return stemNames.indexOf(s) !== -1; })
    .concat(stemNames.filter(function (s) { return STEMS.indexOf(s) === -1; }));
  // Unspezifische Fallback-Stichworte ("drum" bei Kick) zuletzt behandeln, indem spezifischere
  // Elemente zuerst gemappt werden.
  order.sort(function (a, b) {
    var pa = ["kick", "bass", "clap", "hats", "ride", "perc", "vocals", "atmo", "synth"].indexOf(a);
    var pb = ["kick", "bass", "clap", "hats", "ride", "perc", "vocals", "atmo", "synth"].indexOf(b);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  order.forEach(function (stem) {
    var best = null;
    var bestRank = -1;
    usableTracks(tracks).forEach(function (t) {
      if (used[t.index]) return;
      var s = scoreTrack(stem, t.name);
      if (s <= 0) return;
      var rank = s + (t.has_midi_input ? 1000 : 0);
      if (rank > bestRank) { best = t.index; bestRank = rank; }
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
  if (!steps || !steps.length) return true;
  var neutral = NEUTRAL[target];
  return steps.every(function (s) {
    return target === "filter_cutoff" ? s[2] >= neutral * 0.98 : s[2] >= neutral - 0.5;
  });
}

// Globale Kurve hat hoerbare Bewegung (nicht nur offenes Filter / 0 dB).
function pointsHaveMotion(target, points) {
  if (!points || !points.length) return false;
  var vals = points.map(function (p) { return Number(p.value); }).filter(isFinite);
  if (vals.length < 1) return false;
  var mn = Math.min.apply(null, vals);
  var mx = Math.max.apply(null, vals);
  if (target === "filter_cutoff") {
    return mn < NEUTRAL.filter_cutoff * 0.98 || (mx - mn) > 300;
  }
  if (target === "gain") {
    return mn < NEUTRAL.gain - 0.5 || (mx - mn) > 1;
  }
  return (mx - mn) > 0;
}

function stepsHaveMotion(target, steps) {
  return !isNeutral(target, steps);
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

// Plan aus Analyse + Live-Zustand + Optionen. Enthaelt Werte noch in Hz/dB; die Umrechnung in
// Parameter-Rohwerte passiert beim Ausfuehren (braucht str_for_value aus Live).
// Arrangement: vorhandene ~8-Takt-Loops der Spur werden pro aktivem Songteil platziert (keine leeren Clips).
// Geraete nur planen, wenn spaeter wirklich nicht-neutrale Automation geschrieben wird (kein Orphan-FX).
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
      plan.warnings.push("Spur " + (idx + 1) + " fuer " + (STEM_LABELS[stem.name] || stem.name) + " existiert nicht mehr.");
      return;
    }
    var source = track.source_loop || null;
    var label = STEM_LABELS[stem.name] || stem.name;
    if (opts.build_arrangement && !source) {
      plan.warnings.push("'" + track.name + "' (" + label + "): kein Loop am Spuranfang gefunden " +
        "(Session-Slot oder Arrangement-Clip bei Takt 1). Spur ohne Arrangement-Clips.");
    }
    // Automation: Session-Loop oder Arrangement-MIDI (Noten → Hilfs-Slot → write_envelope).
    // Arrangement-Audio: keine Clip-Envelopes in Live 11 ohne Session-Quelle → kein FX.
    var canAutomate = !!(opts.apply_automation && source &&
      (source.kind === "session" || (source.kind === "arrangement" && track.has_midi_input)));
    var automation = [];
    if (canAutomate) {
      automation = (stem.automation || []).filter(function (a) {
        return pointsHaveMotion(a.target, a.points);
      });
    } else if (opts.apply_automation && source && source.kind === "arrangement" && !track.has_midi_input &&
      (stem.automation || []).some(function (a) { return pointsHaveMotion(a.target, a.points); })) {
      plan.warnings.push("'" + track.name + "' (" + label + "): Automation/Effekte uebersprungen " +
        "(Audiospur nur im Arrangement – Loop in einen Session-Slot kopieren fuer Utility/Filter).");
    }
    var clips = [];
    if (opts.build_arrangement && source) {
      sections.forEach(function (s, i) {
        var active = !stem.active_sections || stem.active_sections[i] !== false;
        if (!active) return;
        var envs = [];
        automation.forEach(function (a) {
          var steps = sliceAutomation(a.points, s.start_beat, s.length_beats);
          if (!stepsHaveMotion(a.target, steps)) return;
          envs.push({
            target: a.target, device: a.device,
            class_name: a.class_name || DEVICE_CLASS[a.device],
            parameter: a.parameter, unit: a.unit, steps: steps,
          });
        });
        clips.push({
          section: i,
          start: s.start_beat,
          length: s.length_beats,
          name: s.label,
          color_index: source.color_index,
          source_kind: source.kind,
          source_index: source.index,
          source_length: source.length,
          envelopes: envs,
        });
      });
    }
    // Geraete nur, wenn mindestens ein Clip eine echte Envelope bekommt.
    var neededDevices = {};
    clips.forEach(function (c) {
      c.envelopes.forEach(function (e) {
        neededDevices[e.class_name] = e.device;
      });
    });
    Object.keys(neededDevices).forEach(function (cls) {
      if (!plan.devices.some(function (d) { return d.track === idx && d.class_name === cls; })) {
        plan.devices.push({
          track: idx, device: neededDevices[cls], class_name: cls,
          present: !!findDevice(track, cls),
        });
      }
    });
    if (clips.length) {
      plan.tracks.push({
        track: idx,
        name: track.name,
        stem: stem.name,
        source_loop: source,
        can_automate: canAutomate,
        clips: clips,
      });
    } else if (opts.build_arrangement && source && stem.present !== false) {
      var anyActive = !stem.active_sections || stem.active_sections.some(function (a) { return a !== false; });
      if (!anyActive) {
        plan.warnings.push("'" + track.name + "' (" + label + "): in der Referenz nirgends aktiv – keine Clips.");
      }
    }
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
    t.num_bars + " Takte, Trennung: " + analysis.separation +
    (analysis.device ? " @ " + analysis.device : ""));
  lines.push("Songteile:");
  (analysis.sections || []).forEach(function (s) {
    var el = (s.elements && s.elements.length) ? " (" + s.elements.join(", ") + ")" : "";
    lines.push("  T" + (s.start_bar + 1) + "-" + s.end_bar + "  " + s.label + " [" + s.group + "]" + el);
  });
  if (mapping) {
    lines.push("Zuordnung (Loop = vorhandener ~8-Takt-Clip am Spuranfang):");
    var absent = {};
    (analysis.stems || []).forEach(function (s) { if (s.present === false) absent[s.name] = true; });
    Object.keys(mapping).forEach(function (stem) {
      var tr = mapping[stem] === null ? null : trackByIndex(state, mapping[stem]);
      var label = STEM_LABELS[stem] || stem;
      var loop = tr && tr.source_loop
        ? " [Loop " + tr.source_loop.kind + ", " + Math.round(tr.source_loop.length) + " Beats, Farbe " +
          tr.source_loop.color_index + "]"
        : (tr ? " [kein Loop]" : "");
      lines.push("  " + label + " -> " + (tr ? menuItemForTrack(tr) : "-") + loop +
        (absent[stem] ? " (stumm)" : ""));
    });
  }
  if ((analysis.suggested_devices || []).length) {
    lines.push("Vorschlaege:");
    analysis.suggested_devices.forEach(function (d) {
      lines.push("  " + (STEM_LABELS[d.stem] || d.stem) + ": " + d.device + " - " + d.reason);
    });
  }
  (analysis.hints || []).forEach(function (h) { lines.push("Hinweis: " + h.message); });
  (analysis.warnings || []).forEach(function (w) { lines.push("Warnung: " + w); });
  return lines.join("\n");
}

module.exports = {
  STEMS: STEMS,
  STEM_LABELS: STEM_LABELS,
  MENU_AUTO: MENU_AUTO,
  MENU_NONE: MENU_NONE,
  DEVICE_CLASS: DEVICE_CLASS,
  toPosixPath: toPosixPath,
  scoreTrack: scoreTrack,
  autoMapStems: autoMapStems,
  resolveMapping: resolveMapping,
  menuItems: menuItems,
  parseDisplayValue: parseDisplayValue,
  buildInverseMap: buildInverseMap,
  sliceAutomation: sliceAutomation,
  isNeutral: isNeutral,
  pointsHaveMotion: pointsHaveMotion,
  stepsHaveMotion: stepsHaveMotion,
  findDevice: findDevice,
  findParam: findParam,
  trackByIndex: trackByIndex,
  buildPlan: buildPlan,
  planStats: planStats,
  formatSummary: formatSummary,
};
