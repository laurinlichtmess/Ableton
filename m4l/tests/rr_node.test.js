"use strict";
// Verdrahtung von rr_node.js mit einem nachgebauten max-api-Modul.
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var Module = require("module");
var FakeLive = require("./fake_lom").FakeLive;

function loadNode() {
  var handlers = {};
  var outputs = [];
  var fakeMax = {
    outlet: function () { outputs.push(Array.prototype.slice.call(arguments)); },
    post: function () {},
    addHandler: function (name, fn) { handlers[name] = fn; },
    addHandlers: function (map) { Object.keys(map).forEach(function (k) { handlers[k] = map[k]; }); },
  };
  var origLoad = Module._load;
  Module._load = function (request) {
    if (request === "max-api") return fakeMax;
    return origLoad.apply(this, arguments);
  };
  var file = require.resolve("../js/rr_node.js");
  delete require.cache[file];
  try { require(file); } finally { Module._load = origLoad; }
  return { handlers: handlers, outputs: outputs };
}

test("rr_node.js registriert alle Handler und leitet LOM-Anfragen ueber Max weiter", async function () {
  var n = loadNode();
  ["init", "refresh", "file", "analyze", "apply", "option", "map", "lom_result"].forEach(function (h) {
    assert.equal(typeof n.handlers[h], "function", "Handler fehlt: " + h);
  });
  assert.deepEqual(n.outputs[0], ["status", "Node bereit"]);

  // Max-Kreislauf nachbilden: "lom"-Ausgaben gehen an live_bridge.js, dessen Antwort zurueck an lom_result.
  var live = new FakeLive();
  live.addScene();
  live.addTrack("Bass Synth", true);
  var bridge = live.loadBridge();
  var origPush = n.outputs.push;
  n.outputs.push = function (msg) {
    origPush.call(n.outputs, msg);
    if (msg[0] === "lom") {
      setImmediate(function () {
        bridge.sandbox.lom(msg[1]);
        var out = bridge.outputs.pop();
        n.handlers.lom_result(out[1]);
      });
    }
    return n.outputs.length;
  };
  await n.handlers.init();
  var menu = n.outputs.filter(function (m) { return m[0] === "menu_bass"; });
  assert.deepEqual(menu[0], ["menu_bass", "clear"]);
  assert.ok(menu.some(function (m) { return m[1] === "append" && m[2] === "1: Bass Synth"; }));
  assert.deepEqual(menu[menu.length - 1], ["menu_bass", "set", 0]);

  n.handlers.file("Macintosh", "HD:/Users/me/My", "Song.mp3");
  var status = n.outputs.filter(function (m) { return m[0] === "status"; }).pop();
  assert.match(status[1], /My Song\.mp3/);
});

test("Node-Dateien vermeiden Syntax, die aelteres Node for Max nicht kann", function () {
  ["rr_core.js", "rr_orchestrator.js", "rr_transport.js", "rr_node.js"].forEach(function (f) {
    var src = fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/gm, "");
    assert.ok(!/\?\.[a-zA-Z_(\[]/.test(src), f + ": optional chaining");
    assert.ok(!/\?\?/.test(src), f + ": nullish coalescing");
    assert.ok(!/\bimport\s/.test(src), f + ": ES-Module");
  });
});
