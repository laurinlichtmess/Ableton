"use strict";
// Ablaufsteuerung: Analyse anstossen, Plan bauen, Live-Operationen der Reihe nach ausfuehren.
// Alle Seiteneffekte kommen ueber `deps` herein, damit der Ablauf ohne Live/Max testbar ist.

var core = require("./rr_core");

function Orchestrator(deps) {
  this.deps = deps;
  this.file = null;
  this.analysis = null;
  this.state = null;
  this.overrides = {};
  this.options = { build_arrangement: true, apply_automation: true, set_tempo: true };
  this.busy = false;
}

Orchestrator.prototype.status = function (text) { this.deps.ui.status(text); };

Orchestrator.prototype._exclusive = function (name, fn) {
  var self = this;
  if (self.busy) {
    self.status("Bitte warten: " + self.busy + " laeuft noch");
    return Promise.resolve(false);
  }
  self.busy = name;
  return Promise.resolve().then(fn).then(function (r) {
    self.busy = false;
    return r;
  }, function (err) {
    self.busy = false;
    self.status("Fehler: " + (err && err.message ? err.message : err));
    return false;
  });
};

Orchestrator.prototype.stemNames = function () {
  if (this.analysis) return this.analysis.stems.map(function (s) { return s.name; });
  return core.STEMS.slice();
};

Orchestrator.prototype.mapping = function () {
  return core.resolveMapping(this.stemNames(), this.state ? this.state.tracks : [], this.overrides);
};

Orchestrator.prototype.refreshTracks = function () {
  var self = this;
  return self.deps.lom({ op: "get_state" }).then(function (state) {
    self.state = state;
    var items = core.menuItems(state.tracks);
    core.STEMS.forEach(function (stem) {
      var sel = items.indexOf(self.overrides[stem] || core.MENU_AUTO);
      self.deps.ui.menu(stem, items, sel < 0 ? 0 : sel);
    });
    self.renderSummary();
    return state;
  });
};

Orchestrator.prototype.renderSummary = function () {
  if (this.analysis) this.deps.ui.summary(core.formatSummary(this.analysis, this.mapping(), this.state));
};

Orchestrator.prototype.setFile = function (rawPath) {
  this.file = core.toPosixPath(rawPath, this.deps.exists);
  this.analysis = null;
  this.status("Datei: " + this.file.split("/").pop() + " - jetzt 'Analysieren'");
  return this.file;
};

Orchestrator.prototype.setOption = function (name, value) {
  if (Object.prototype.hasOwnProperty.call(this.options, name)) this.options[name] = !!Number(value);
};

Orchestrator.prototype.setOverride = function (stem, item) {
  this.overrides[stem] = item;
  this.renderSummary();
};

Orchestrator.prototype.ensureEngine = function () {
  var self = this;
  var d = self.deps;
  return d.engine.health().catch(function () {
    if (!d.startEngine()) {
      throw new Error("Engine nicht erreichbar. Bitte 'start-engine.sh' ausfuehren (siehe README).");
    }
    self.status("Starte Analyse-Engine ...");
    var tries = 0;
    function poll() {
      return d.sleep(1000).then(function () {
        return d.engine.health().catch(function (e) {
          if (++tries >= 40) throw new Error("Engine startet nicht: " + e.message);
          return poll();
        });
      });
    }
    return poll();
  });
};

Orchestrator.prototype.analyze = function () {
  var self = this;
  var d = self.deps;
  return self._exclusive("Analyse", function () {
    if (!self.file) throw new Error("Zuerst eine MP3 auf das Feld ziehen.");
    return self.ensureEngine().then(function (health) {
      self.status("Analyse gestartet" + (health && health.demucs_available ? " (Demucs)" : " (ohne Demucs)"));
      return d.engine.createJob(self.file, d.separation || "auto");
    }).then(function (job) {
      function poll() {
        return d.engine.getJob(job.job_id).then(function (j) {
          if (j.status === "done") return j.result;
          if (j.status === "error") throw new Error(j.error || "Analyse fehlgeschlagen");
          self.status("Analyse " + Math.round(j.progress * 100) + "%: " + j.message);
          return d.sleep(1000).then(poll);
        });
      }
      return poll();
    }).then(function (result) {
      self.analysis = result;
      return self.refreshTracks().catch(function () { return null; });
    }).then(function () {
      self.renderSummary();
      self.status("Analyse fertig: " + self.analysis.sections.length + " Songteile, " +
        self.analysis.suggested_devices.length + " Effekt-Vorschlaege");
      return self.analysis;
    });
  });
};

function message(err) { return err && err.message ? err.message : String(err); }

// Ein fehlgeschlagener Schritt bricht "Anwenden" nicht ab: Fehler landet als Hinweis im Bericht.
function attempt(report, label, fn) {
  return Promise.resolve().then(fn).catch(function (err) {
    report.warnings.push(label + ": " + message(err));
    return null;
  });
}

function isRemoteUnreachable(err) {
  return /antwortet nicht/.test(message(err));
}

Orchestrator.prototype._remote = function (report, msg) {
  if (report.remote_down) return Promise.reject(new Error("Remote Script nicht erreichbar (uebersprungen)"));
  return this.deps.remote.request(msg).catch(function (err) {
    if (isRemoteUnreachable(err)) report.remote_down = true;
    throw err;
  });
};

Orchestrator.prototype._insertMissingDevices = function (plan, report) {
  var self = this;
  var d = self.deps;
  report._inserted = report._inserted || [];
  var missing = plan.devices.filter(function (dev) { return !dev.present; });
  return missing.reduce(function (p, dev) {
    return p.then(function () {
      var track = core.trackByIndex(self.state, dev.track);
      self.status("Fuege " + dev.device + " auf '" + track.name + "' ein ...");
      return self._remote(report, { cmd: "load_device", track_index: dev.track, device: dev.device })
        .then(function () { return d.sleep(300); })
        .then(function () { return d.lom({ op: "get_state" }); })
        .then(function (state) {
          self.state = state;
          if (core.findDevice(core.trackByIndex(state, dev.track), dev.class_name)) {
            report.devices_inserted.push(dev.device + " -> " + track.name);
            report._inserted.push({ track: dev.track, class_name: dev.class_name, device: dev.device });
          } else {
            report.warnings.push(dev.device + " wurde auf '" + track.name + "' nicht gefunden.");
          }
        }, function (err) {
          report.warnings.push(dev.device + " nicht eingefuegt: " + message(err));
        });
    });
  }, Promise.resolve());
};

// Geraete wieder entfernen, wenn keine Envelope geschrieben werden kann (kein Orphan-FX).
Orchestrator.prototype._pruneOrphanDevices = function (plan, targets, report) {
  var self = this;
  var d = self.deps;
  var needed = {};
  plan.tracks.forEach(function (t) {
    t.clips.forEach(function (c) {
      c.envelopes = (c.envelopes || []).filter(function (e) {
        var key = t.track + "|" + e.class_name + "|" + e.parameter;
        return !!targets[key] && core.stepsHaveMotion(e.target, e.steps);
      });
      c.envelopes.forEach(function (e) {
        needed[t.track + "|" + e.class_name] = true;
      });
    });
  });
  var inserted = report._inserted || [];
  return inserted.reduce(function (p, ins) {
    return p.then(function () {
      if (needed[ins.track + "|" + ins.class_name]) return null;
      var track = core.trackByIndex(self.state, ins.track);
      report.warnings.push(ins.device + " auf '" + (track ? track.name : "?") +
        "' wieder entfernt (keine schreibbare Automation).");
      return attempt(report, "Entferne " + ins.device, function () {
        return d.lom({ op: "delete_device", track: ins.track, class_name: ins.class_name });
      }).then(function () {
        report.devices_inserted = report.devices_inserted.filter(function (s) {
          return s.indexOf(ins.device + " -> ") !== 0;
        });
        return d.lom({ op: "get_state" }).then(function (state) { self.state = state; });
      });
    });
  }, Promise.resolve());
};

// Fuer jede (Spur, Geraeteklasse, Parameter): LOM-Indizes + Umrechnung Hz/dB -> Rohwert.
Orchestrator.prototype._resolveTargets = function (plan, report) {
  var self = this;
  var d = self.deps;
  var targets = {};
  var jobs = [];
  plan.tracks.forEach(function (t) {
    t.clips.forEach(function (c) {
      c.envelopes.forEach(function (e) {
        var key = t.track + "|" + e.class_name + "|" + e.parameter;
        if (!targets[key]) { targets[key] = null; jobs.push({ key: key, track: t.track, env: e }); }
      });
    });
  });
  return jobs.reduce(function (p, job) {
    return p.then(function () {
      var track = core.trackByIndex(self.state, job.track);
      var dev = core.findDevice(track, job.env.class_name);
      if (!dev) {
        report.warnings.push("Kein " + job.env.device + " auf '" + track.name + "': Automation uebersprungen.");
        return null;
      }
      return attempt(report, job.env.device + "/" + job.env.parameter + " auf '" + track.name + "'", function () {
        return d.lom({ op: "get_params", track: job.track, device: dev.index }).then(function (res) {
          var param = core.findParam(res.params, job.env.parameter);
          if (!param) {
            report.warnings.push("Parameter '" + job.env.parameter + "' in " + job.env.device + " nicht gefunden.");
            return null;
          }
          return d.lom({ op: "sample_param", track: job.track, device: dev.index, param: param.index, count: 64 })
            .then(function (s) {
              var inv = core.buildInverseMap(s.samples, job.env.unit);
              if (!inv) {
                report.warnings.push("Werte von " + job.env.device + "/" + param.name + " nicht lesbar.");
                return null;
              }
              targets[job.key] = { device: dev.index, param: param.index, toRaw: inv };
            });
        });
      });
    });
  }, Promise.resolve()).then(function () { return targets; });
};

Orchestrator.prototype.apply = function () {
  var self = this;
  var d = self.deps;
  return self._exclusive("Anwenden", function () {
    if (!self.analysis) throw new Error("Zuerst analysieren.");
    var report = { locators: 0, clips: 0, envelopes: 0, devices_inserted: [], warnings: [] };
    var plan;
    var scene = null;
    return d.lom({ op: "get_state" }).then(function (state) {
      self.state = state;
      plan = core.buildPlan(self.analysis, state, self.options, self.mapping());
      report.warnings = report.warnings.concat(plan.warnings);
      if (plan.tempo) {
        return attempt(report, "Tempo " + plan.tempo, function () { return d.lom({ op: "set_tempo", tempo: plan.tempo }); });
      }
    }).then(function () {
      return plan.locators.reduce(function (p, loc) {
        return p.then(function () {
          return attempt(report, "Locator '" + loc.name + "' (Beat " + loc.time + ")", function () {
            return d.lom({ op: "set_locator", time: loc.time, name: loc.name }).then(function (res) {
              report.locators++;
              if (res && res.name_ok === false) report.warnings.push("Locator bei Beat " + loc.time + ": Name nicht gesetzt.");
            });
          });
        });
      }, Promise.resolve());
    }).then(function () {
      if (self.options.apply_automation && plan.devices.length) {
        return self._insertMissingDevices(plan, report);
      }
    }).then(function () {
      return self._resolveTargets(plan, report);
    }).then(function (targets) {
      return self._pruneOrphanDevices(plan, targets, report).then(function () { return targets; });
    }).then(function (targets) {
      if (!plan.tracks.length) return null;
      var needsHelper = plan.tracks.some(function (t) {
        return t.can_automate && (t.clips || []).some(function (c) {
          return (c.envelopes || []).length > 0;
        });
      });
      var start = needsHelper
        ? attempt(report, "Hilfs-Szene", function () {
          return d.lom({ op: "create_scene" }).then(function (res) { scene = res.scene_index; });
        })
        : Promise.resolve();
      return start.then(function () {
        return plan.tracks.reduce(function (p, t) {
          return t.clips.reduce(function (p2, c) {
            return p2.then(function () {
              self.status("Loop '" + c.name + "' auf '" + t.name + "' ...");
              return self._buildClip(t, c, scene, targets, report);
            });
          }, p);
        }, Promise.resolve());
      });
    }).then(function () {
      return self._finish(scene, report);
    }, function (err) {
      return self._finish(scene, report).then(function () { throw err; });
    });
  });
};

var ENVELOPE_CHUNK = 200;

Orchestrator.prototype._writeEnvelope = function (report, t, scene, target, steps) {
  var self = this;
  var chunks = [];
  for (var i = 0; i < steps.length; i += ENVELOPE_CHUNK) chunks.push(steps.slice(i, i + ENVELOPE_CHUNK));
  return chunks.reduce(function (p, chunk) {
    return p.then(function () {
      return self._remote(report, { cmd: "write_envelope", track_index: t.track, scene_index: scene,
        device_index: target.device, parameter_index: target.param, steps: chunk });
    });
  }, Promise.resolve());
};

// Vorhandenen Loop der Spur an die Abschnittsposition legen (Inhalt + Farbe), optional mit Automation.
// Reihenfolge bei Automation: kopieren -> auf Abschnittslaenge strecken -> Envelopes -> Arrangement.
Orchestrator.prototype._buildClip = function (t, c, scene, targets, report) {
  var self = this;
  var d = self.deps;
  var label = "Loop '" + c.name + "' auf '" + t.name + "'";
  var source = t.source_loop;
  if (!source || c.source_kind == null) {
    report.warnings.push(label + ": kein Quell-Loop.");
    return Promise.resolve();
  }
  var envs = (c.envelopes || []).filter(function (e) {
    var target = targets[t.track + "|" + e.class_name + "|" + e.parameter];
    return !!target && core.stepsHaveMotion(e.target, e.steps);
  });
  var useHelper = envs.length > 0 && t.can_automate && scene !== null && scene !== undefined;

  var place = useHelper
    ? d.lom({
      op: "copy_clip_to_slot", track: t.track, source_kind: source.kind,
      source_index: source.index, dest_scene: scene,
    }).then(function () {
      return d.lom({
        op: "stretch_session_clip", track: t.track, scene: scene, length: c.length,
        color_index: c.color_index, name: c.name,
      });
    }).then(function (stretched) {
      if (stretched && stretched.note_count === 0) {
        throw new Error("Hilfsclip hat keine MIDI-Noten (Quelle pruefen)");
      }
      return envs.reduce(function (p, e) {
        var target = targets[t.track + "|" + e.class_name + "|" + e.parameter];
        var steps = e.steps.map(function (s) { return [s[0], s[1], target.toRaw(s[2])]; });
        return p.then(function () {
          if (report.remote_down) return null;
          return attempt(report, label + ", Automation " + e.device + "/" + e.parameter, function () {
            return self._writeEnvelope(report, t, scene, target, steps).then(function () { report.envelopes++; });
          });
        });
      }, Promise.resolve());
    }).then(function () {
      return d.lom({ op: "duplicate_to_arrangement", track: t.track, scene: scene, time: c.start });
    }).then(function () {
      return d.lom({
        op: "stretch_arrangement_clip", track: t.track, time: c.start, length: c.length,
        color_index: c.color_index, name: c.name,
      });
    })
    : d.lom({
      op: "place_loop", track: t.track, source_kind: source.kind, source_index: source.index,
      time: c.start, length: c.length, name: c.name, color_index: c.color_index,
    });

  return place.then(function () {
    report.clips++;
  }).catch(function (err) {
    report.warnings.push(label + ": " + message(err));
  }).then(function () {
    if (!useHelper) return null;
    return attempt(report, label + " (Aufraeumen)", function () {
      return d.lom({ op: "delete_clip", track: t.track, scene: scene });
    });
  });
};

Orchestrator.prototype._finish = function (scene, report) {
  var self = this;
  var cleanup = scene === null ? Promise.resolve() :
    self.deps.lom({ op: "delete_scene", scene_index: scene }).catch(function (e) {
      report.warnings.push("Hilfs-Szene nicht geloescht: " + e.message);
    });
  return cleanup.then(function () {
    if (report.remote_down) {
      report.warnings.push("Remote Script nicht erreichbar: Effekte/Automation teilweise uebersprungen. " +
        "Control Surface 'ReferenceRebuilder' aktiv?");
    }
    self.lastReport = report;
    var text = "Fertig: " + report.locators + " Locators, " + report.clips + " Clips, " + report.envelopes +
      " Automationen" + (report.devices_inserted.length ? ", eingefuegt: " + report.devices_inserted.join(", ") : "") +
      (report.warnings.length ? " - " + report.warnings.length + " Hinweis(e) im Textfeld" : "");
    self.status(text);
    var summary = core.formatSummary(self.analysis, self.mapping(), self.state);
    if (report.clips > 0) {
      summary += "\n\nHinweis: Dein ~8-Takt-Loop ist ueber die volle Referenzlaenge gekachelt (Noten/Audio + Farbe " +
        "wie das Original). Presence-Stille nur optional. Auto Filter/Utility nur wenn Automation wirklich " +
        "geschrieben wurde.";
    }
    if (report.warnings.length) summary += "\n\nHinweise beim Anwenden:\n  " + report.warnings.join("\n  ");
    self.deps.ui.summary(summary);
    return report;
  });
};

module.exports = { Orchestrator: Orchestrator };
