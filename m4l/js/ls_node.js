"use strict";
// Einstieg fuer [node.script ls_node.js]. Loop Sketch — Templates + To Arr.
//
// Eingehend: init | refresh | to_arr | template <menuetext...> | option <name> <0|1>
//            | map <role> <menuetext...> | lom_result <json>
// Ausgehend: ready | status <text> | summary <text> | menu_template ... | menu_<role> ... | lom <json>

var maxApi = require("max-api");
var fs = require("fs");
var path = require("path");
var core = require("./ls_core");
var Orchestrator = require("./ls_orchestrator").Orchestrator;

var pending = {};
var reqId = 0;
var LOM_TIMEOUT_MS = 15000;

function lom(op) {
  return new Promise(function (resolve, reject) {
    var id = ++reqId;
    op.req = id;
    var timer = setTimeout(function () {
      delete pending[id];
      reject(new Error("Live API antwortet nicht (" + op.op + ")"));
    }, LOM_TIMEOUT_MS);
    pending[id] = { resolve: resolve, reject: reject, timer: timer };
    maxApi.outlet("lom", JSON.stringify(op));
  });
}

maxApi.addHandler("lom_result", function () {
  var text = Array.prototype.slice.call(arguments).join(" ");
  var msg;
  try { msg = JSON.parse(text); } catch (e) { maxApi.post("lom_result kein JSON: " + text); return; }
  var p = pending[msg.req];
  if (!p) return;
  clearTimeout(p.timer);
  delete pending[msg.req];
  if (msg.ok) p.resolve(msg.result);
  else p.reject(new Error(msg.error));
});

var ui = {
  status: function (text) { maxApi.outlet("status", String(text)); },
  summary: function (text) { maxApi.outlet("summary", String(text)); },
  menu: function (role, items, selected) {
    var out = "menu_" + role;
    maxApi.outlet(out, "clear");
    items.forEach(function (it) { maxApi.outlet(out, "append", it); });
    maxApi.outlet(out, "set", selected);
  },
  templateMenu: function (items, selected) {
    maxApi.outlet("menu_template", "clear");
    items.forEach(function (it) { maxApi.outlet("menu_template", "append", it); });
    maxApi.outlet("menu_template", "set", selected);
  },
};

function resolveTemplatesDir() {
  // 1) Neben dem Device (Installer kopiert templates/ dorthin)
  // 2) Repo-Root relativ zu diesem Script (Entwicklung)
  var candidates = [
    path.join(__dirname, "templates"),
    path.join(__dirname, "..", "templates"),
    path.join(__dirname, "..", "..", "templates"),
  ];
  for (var i = 0; i < candidates.length; i++) {
    var idx = path.join(candidates[i], "index.json");
    try {
      if (fs.existsSync(idx)) return candidates[i];
    } catch (e) { /* ignore */ }
  }
  return candidates[0];
}

function loadTemplates() {
  var dir = resolveTemplatesDir();
  var indexPath = path.join(dir, "index.json");
  if (!fs.existsSync(indexPath)) {
    throw new Error("Templates nicht gefunden unter " + dir);
  }
  var index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  return core.loadTemplateCatalog(index, function (name) {
    return fs.readFileSync(path.join(dir, name), "utf8");
  });
}

var templates = [];
try {
  templates = loadTemplates();
} catch (e) {
  maxApi.post("Loop Sketch: Templates laden fehlgeschlagen: " + e.message);
}

var orchestrator = new Orchestrator({
  lom: lom,
  ui: ui,
  templates: templates,
});

function args(list) { return Array.prototype.slice.call(list); }

maxApi.addHandlers({
  init: function () {
    if (!templates.length) {
      ui.status("Keine Templates — Installation pruefen (templates/).");
      return Promise.resolve();
    }
    orchestrator.pushMenus();
    ui.status("Bereit. Template waehlen, Spuren zuordnen, To Arr.");
    return orchestrator.refreshTracks().catch(function (e) {
      ui.status("Spuren nicht lesbar: " + e.message);
    });
  },
  refresh: function () {
    return orchestrator.refreshTracks().then(
      function () { ui.status("Spurliste aktualisiert"); },
      function (e) { ui.status("Fehler: " + e.message); }
    );
  },
  to_arr: function () {
    return orchestrator.toArr();
  },
  template: function () {
    orchestrator.setTemplateByMenu(args(arguments).join(" "));
  },
  option: function (name, value) {
    orchestrator.setOption(name, value);
  },
  map: function () {
    var a = args(arguments);
    orchestrator.setOverride(String(a[0]), a.slice(1).join(" "));
  },
});

ui.status("Node bereit (" + templates.length + " Templates)");
maxApi.outlet("ready");
