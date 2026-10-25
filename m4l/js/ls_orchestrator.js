"use strict";
// Loop Sketch Ablauf: Template waehlen, Spuren mappen, To Arr ausfuehren.
// Seiteneffekte nur ueber `deps` (lom, ui) — ohne Live/Max testbar.

var core = require("./ls_core");

function Orchestrator(deps) {
  this.deps = deps;
  this.templates = deps.templates || [];
  this.template = this.templates.length ? this.templates[0] : null;
  this.state = null;
  this.overrides = {};
  this.options = { set_tempo: true }; // immer 145 BPM beim To Arr
  this.busy = false;
  this.lastPlan = null;
  this.lastReport = null;
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

Orchestrator.prototype.mapping = function () {
  return core.resolveMapping(core.ROLES.slice(), this.state ? this.state.tracks : [], this.overrides);
};

Orchestrator.prototype.setTemplateByMenu = function (menuText) {
  var found = core.findTemplateByMenu(this.templates, menuText);
  if (!found) {
    this.status("Template nicht gefunden: " + menuText);
    return null;
  }
  this.template = found;
  this.renderSummary();
  this.status("Template: " + found.genre + " — " + found.name);
  return found;
};

Orchestrator.prototype.setOption = function (name, value) {
  if (Object.prototype.hasOwnProperty.call(this.options, name)) {
    this.options[name] = !!Number(value);
  }
};

Orchestrator.prototype.setOverride = function (role, item) {
  this.overrides[role] = item;
  this.renderSummary();
};

Orchestrator.prototype.pushMenus = function () {
  var self = this;
  var trackItems = core.menuItems(self.state ? self.state.tracks : []);
  core.ROLES.forEach(function (role) {
    var sel = trackItems.indexOf(self.overrides[role] || core.MENU_AUTO);
    self.deps.ui.menu(role, trackItems, sel < 0 ? 0 : sel);
  });
  if (self.deps.ui.templateMenu) {
    var tItems = core.listTemplateMenuItems(self.templates);
    var tSel = 0;
    if (self.template) {
      var want = self.template.genre + " — " + self.template.name;
      var idx = tItems.indexOf(want);
      if (idx >= 0) tSel = idx;
    }
    self.deps.ui.templateMenu(tItems, tSel);
  }
};

Orchestrator.prototype.renderSummary = function () {
  if (!this.template) {
    this.deps.ui.summary("Kein Template geladen.");
    return;
  }
  this.deps.ui.summary(core.formatSummary(this.template, this.mapping(), this.state));
};

Orchestrator.prototype.refreshTracks = function () {
  var self = this;
  return self.deps.lom({ op: "get_state" }).then(function (state) {
    self.state = state;
    self.pushMenus();
    self.renderSummary();
    return state;
  });
};

Orchestrator.prototype.buildPlan = function () {
  if (!this.template) throw new Error("Kein Template gewaehlt.");
  if (!this.state) throw new Error("Spuren noch nicht geladen — zuerst 'Spuren'.");
  var plan = core.buildPlan(this.template, this.state, this.mapping(), this.options);
  this.lastPlan = plan;
  return plan;
};

function message(err) {
  return err && err.message ? err.message : String(err);
}

function attempt(report, label, fn) {
  return Promise.resolve().then(fn).catch(function (err) {
    report.warnings.push(label + ": " + message(err));
    return null;
  });
}

Orchestrator.prototype.toArr = function () {
  var self = this;
  var d = self.deps;
  return self._exclusive("To Arr", function () {
    return self.refreshTracks().then(function () {
      var plan = self.buildPlan();
      var stats = core.planStats(plan);
      if (!stats.clips) {
        throw new Error("Keine Clips geplant. Mapping und Session-Szene-1-Loops pruefen.");
      }
      self.status("To Arr: " + stats.tracks + " Spuren, " + stats.clips + " Abschnitts-Clips ...");
      var report = {
        locators: 0, clips: 0, warnings: plan.warnings.slice(),
      };

      // Tempo zuerst (145), dann Locators, dann ein Clip pro aktiver Region (loopend).
      var tempoStep = plan.tempo
        ? attempt(report, "Tempo", function () {
          return d.lom({ op: "set_tempo", tempo: plan.tempo }).then(function () {
            report.tempo = plan.tempo;
          });
        })
        : Promise.resolve();

      return tempoStep.then(function () {
        return plan.locators.reduce(function (p, loc) {
          return p.then(function () {
            return attempt(report, "Locator " + loc.name, function () {
              return d.lom({ op: "set_locator", time: loc.time, name: loc.name }).then(function () {
                report.locators++;
              });
            });
          });
        }, Promise.resolve());
      }).then(function () {
        return plan.tracks.reduce(function (p, t) {
          return t.clips.reduce(function (p2, c) {
            return p2.then(function () {
              self.status("Abschnitt '" + c.name + "' auf '" + t.name + "' @ " + c.start +
                " (" + Math.round(c.length / 4) + " Takte, Loop " +
                Math.round((c.loop_length || 32) / 4) + " Takte)");
              var source = t.source_loop;
              return attempt(report, "Loop '" + c.name + "' auf '" + t.name + "'", function () {
                return d.lom({
                  op: "place_loop",
                  track: t.track,
                  source_kind: source.kind || "session",
                  source_index: source.index != null ? source.index : 0,
                  time: c.start,
                  length: c.length,
                  loop_length: c.loop_length,
                  name: c.name,
                  color_index: c.color_index,
                }).then(function () { report.clips++; });
              });
            });
          }, p);
        }, Promise.resolve());
      }).then(function () {
        self.lastReport = report;
        var text = "Fertig: " + report.locators + " Locators, " + report.clips + " Abschnitts-Clips" +
          (report.tempo ? ", Tempo " + report.tempo : "") +
          (report.warnings.length ? " — " + report.warnings.length + " Hinweis(e)" : "");
        self.status(text);
        var summary = core.formatSummary(self.template, self.mapping(), self.state);
        summary += "\n\nTo Arr: " + report.clips + " Abschnitts-Clips (ein Clip pro aktiver Region," +
          " 8-Takt-Loop gelooppt) aus Session-Szene 1. Tempo " +
          (report.tempo || core.DEFAULT_BPM) + " BPM.";
        if (report.warnings.length) {
          summary += "\n\nHinweise:\n  " + report.warnings.join("\n  ");
        }
        d.ui.summary(summary);
        return report;
      });
    });
  });
};

module.exports = { Orchestrator: Orchestrator };
