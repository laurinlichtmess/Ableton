"use strict";
// Einstieg fuer [node.script rr_node.js]. Verbindet Max-Nachrichten mit dem Orchestrator.
//
// Eingehend (linker Einlass): init | refresh | file <pfad> | analyze | apply
//                             | option <name> <0|1> | map <stem> <menuetext...> | lom_result <json>
// Ausgehend: ready | status <text> | summary <text> | menu_<stem> clear|append|set ... | lom <json>

var maxApi = require("max-api");
var fs = require("fs");
var transport = require("./rr_transport");
var Orchestrator = require("./rr_orchestrator").Orchestrator;

var config = transport.readConfig();
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
  status: function (text) {
    maxApi.outlet("status", String(text));
  },
  summary: function (text) {
    maxApi.outlet("summary", String(text));
  },
  menu: function (stem, items, selected) {
    var out = "menu_" + stem;
    maxApi.outlet(out, "clear");
    items.forEach(function (it) { maxApi.outlet(out, "append", it); });
    maxApi.outlet(out, "set", selected);
  },
};

var engineUrl = String(config.engine_url).replace(/\/$/, "");
var orchestrator = new Orchestrator({
  lom: lom,
  ui: ui,
  separation: config.separation,
  exists: function (p) { try { return fs.existsSync(p); } catch (e) { return false; } },
  sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
  startEngine: function () { return transport.spawnEngine(config.engine_start_command); },
  engine: {
    health: function () { return transport.httpJson("GET", engineUrl + "/health", undefined, 2000); },
    createJob: function (path, separation) {
      var body = { path: path, separation: separation };
      if (config.bpm_hint != null) body.bpm_hint = Number(config.bpm_hint);
      if (config.bpm_min != null) body.bpm_min = Number(config.bpm_min);
      if (config.bpm_max != null) body.bpm_max = Number(config.bpm_max);
      return transport.httpJson("POST", engineUrl + "/jobs", body, 10000);
    },
    getJob: function (id) { return transport.httpJson("GET", engineUrl + "/jobs/" + id, undefined, 10000); },
  },
  remote: {
    request: function (msg) {
      return transport.udpRequest(config.remote_host, config.remote_port, msg, 5000);
    },
  },
});

function args(list) { return Array.prototype.slice.call(list); }

maxApi.addHandlers({
  init: function () {
    ui.status("Bereit. MP3 auf das Feld ziehen.");
    return orchestrator.refreshTracks().catch(function (e) { ui.status("Spuren nicht lesbar: " + e.message); });
  },
  refresh: function () {
    return orchestrator.refreshTracks().then(function () { ui.status("Spurliste aktualisiert"); },
      function (e) { ui.status("Fehler: " + e.message); });
  },
  file: function () { orchestrator.setFile(args(arguments).join(" ")); },
  analyze: function () { return orchestrator.analyze(); },
  apply: function () { return orchestrator.apply(); },
  option: function (name, value) { orchestrator.setOption(name, value); },
  map: function () {
    var a = args(arguments);
    orchestrator.setOverride(String(a[0]), a.slice(1).join(" "));
  },
});

ui.status("Node bereit");
// Patch schickt daraufhin die gespeicherten Toggle-Werte und "init" (Node startet erst nach dem Laden).
maxApi.outlet("ready");
