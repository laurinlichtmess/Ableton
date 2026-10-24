"use strict";
// Netzwerk/Dateisystem fuer Node for Max: Engine (HTTP), Remote Script (UDP/JSON), Konfiguration.

var http = require("http");
var dgram = require("dgram");
var fs = require("fs");
var os = require("os");
var path = require("path");
var childProcess = require("child_process");

var DEFAULTS = {
  engine_url: "http://127.0.0.1:47821",
  remote_host: "127.0.0.1",
  remote_port: 47822,
  engine_start_command: null,
  separation: "auto",
  bpm_hint: null,
  bpm_min: null,
  bpm_max: null,
};

function configPath(home) {
  return path.join(home || os.homedir(), "Library", "Application Support", "ReferenceRebuilder", "config.json");
}

function readConfig(file) {
  var cfg = Object.assign({}, DEFAULTS);
  try {
    Object.assign(cfg, JSON.parse(fs.readFileSync(file || configPath(), "utf8")));
  } catch (e) {
    // Keine/kaputte Konfiguration -> Standardwerte.
  }
  return cfg;
}

function httpJson(method, url, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var u = new URL(url);
    var data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    var req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method,
      headers: data ? { "Content-Type": "application/json", "Content-Length": data.length } : {},
    }, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        var text = Buffer.concat(chunks).toString("utf8");
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* kein JSON */ }
        if (res.statusCode >= 400) {
          var detail = json && json.detail ? (typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail)) : text;
          var err = new Error("HTTP " + res.statusCode + ": " + detail);
          err.status = res.statusCode;
          reject(err);
        } else {
          resolve(json);
        }
      });
    });
    req.setTimeout(timeoutMs || 10000, function () { req.destroy(new Error("Zeitueberschreitung: " + url)); });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

var reqCounter = 0;

// Eine JSON-Anfrage per UDP an den Remote Script, wartet auf die Antwort mit gleicher id.
function udpRequest(host, port, message, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var sock = dgram.createSocket("udp4");
    var id = "n" + Date.now().toString(36) + (reqCounter++);
    var payload = Buffer.from(JSON.stringify(Object.assign({ id: id }, message)));
    var timer = setTimeout(function () {
      sock.close();
      reject(new Error("Remote Script antwortet nicht (Port " + port + "). Ist 'ReferenceRebuilder' als Control Surface aktiv?"));
    }, timeoutMs || 3000);
    sock.on("message", function (buf) {
      var msg;
      try { msg = JSON.parse(buf.toString("utf8")); } catch (e) { return; }
      if (msg.id !== id) return;
      clearTimeout(timer);
      sock.close();
      if (msg.ok) resolve(msg);
      else reject(new Error(msg.error || "Remote Script Fehler"));
    });
    sock.on("error", function (e) { clearTimeout(timer); sock.close(); reject(e); });
    sock.send(payload, port, host);
  });
}

function spawnEngine(command) {
  if (!command || !command.length) return false;
  var cmd = Array.isArray(command) ? command : [command];
  var child = childProcess.spawn(cmd[0], cmd.slice(1), { detached: true, stdio: "ignore" });
  child.unref();
  return true;
}

module.exports = {
  DEFAULTS: DEFAULTS,
  configPath: configPath,
  readConfig: readConfig,
  httpJson: httpJson,
  udpRequest: udpRequest,
  spawnEngine: spawnEngine,
};
