"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var http = require("http");
var dgram = require("dgram");
var fs = require("fs");
var os = require("os");
var path = require("path");
var transport = require("../js/rr_transport");

function listen(server) {
  return new Promise(function (r) { server.listen(0, "127.0.0.1", function () { r(server.address().port); }); });
}

test("httpJson: GET/POST, Fehlerdetails, Timeout", async function () {
  var server = http.createServer(function (req, res) {
    var body = "";
    req.on("data", function (c) { body += c; });
    req.on("end", function () {
      if (req.url === "/slow") return;
      if (req.url === "/bad") { res.writeHead(400); res.end(JSON.stringify({ detail: "Datei nicht gefunden" })); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ method: req.method, body: body ? JSON.parse(body) : null }));
    });
  });
  var port = await listen(server);
  var base = "http://127.0.0.1:" + port;
  assert.deepEqual(await transport.httpJson("GET", base + "/health"), { method: "GET", body: null });
  assert.deepEqual(await transport.httpJson("POST", base + "/jobs", { path: "/a b.mp3" }),
    { method: "POST", body: { path: "/a b.mp3" } });
  await assert.rejects(transport.httpJson("GET", base + "/bad"), /HTTP 400: Datei nicht gefunden/);
  await assert.rejects(transport.httpJson("GET", base + "/slow", undefined, 100), /Zeitueberschreitung/);
  server.close();
  await assert.rejects(transport.httpJson("GET", "http://127.0.0.1:1/health", undefined, 500));
});

test("udpRequest: Antwort mit passender id, Fehler, Timeout", async function () {
  var server = dgram.createSocket("udp4");
  await new Promise(function (r) { server.bind(0, "127.0.0.1", r); });
  server.on("message", function (buf, rinfo) {
    var msg = JSON.parse(buf.toString());
    if (msg.cmd === "silent") return;
    server.send(JSON.stringify({ id: "fremd", ok: true }), rinfo.port, rinfo.address);
    var reply = msg.cmd === "fail" ? { id: msg.id, ok: false, error: "Geraet nicht gefunden" } : { id: msg.id, ok: true, echo: msg };
    server.send(JSON.stringify(reply), rinfo.port, rinfo.address);
  });
  var port = server.address().port;
  var res = await transport.udpRequest("127.0.0.1", port, { cmd: "load_device", track_index: 2, device: "Auto Filter" });
  assert.equal(res.echo.device, "Auto Filter");
  await assert.rejects(transport.udpRequest("127.0.0.1", port, { cmd: "fail" }), /Geraet nicht gefunden/);
  await assert.rejects(transport.udpRequest("127.0.0.1", port, { cmd: "silent" }, 150), /Control Surface/);
  server.close();
});

test("readConfig: Standardwerte und Datei", function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-"));
  var file = path.join(dir, "config.json");
  assert.equal(transport.readConfig(file).engine_url, "http://127.0.0.1:47821");
  assert.equal(transport.readConfig(file).remote_port, 47822);
  fs.writeFileSync(file, JSON.stringify({ engine_url: "http://127.0.0.1:5000", engine_start_command: ["/x.sh"] }));
  var cfg = transport.readConfig(file);
  assert.equal(cfg.engine_url, "http://127.0.0.1:5000");
  assert.deepEqual(cfg.engine_start_command, ["/x.sh"]);
  assert.equal(cfg.remote_port, 47822);
  assert.match(transport.configPath("/Users/x"), /Application Support\/ReferenceRebuilder\/config\.json$/);
  assert.equal(transport.spawnEngine(null), false);
});
