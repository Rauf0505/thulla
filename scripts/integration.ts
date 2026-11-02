import { spawn, ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import type { View } from "../src/protocol";
const data = mkdtempSync(join(tmpdir(), "thulla-test-"));
let server: ChildProcess;
const url = "ws://localhost:3019/ws";
async function start() {
  server = spawn(
    process.execPath,
    ["--import", "tsx", "server.ts", "--production"],
    {
      env: { ...process.env, PORT: "3019", DATA_DIR: data },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let errors = "";
  server.stderr!.on("data", (d) => {
    errors += String(d);
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Server startup timed out")),
      20000,
    );
    server.stdout!.on("data", (d) => {
      if (String(d).includes("Thulla ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.once("exit", (code) => {
      clearTimeout(timeout);
      reject(Error("Server exited " + code + " " + errors));
    });
  });
}
async function stop() {
  if (server.exitCode !== null || server.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    server.once("exit", () => resolve());
    server.kill();
  });
}
class Guest {
  token = randomUUID();
  ws!: WebSocket;
  view!: View;
  messages: any[] = [];
  async connect() {
    this.ws = new WebSocket(url);
    await new Promise<void>((resolve) => this.ws.once("open", () => resolve()));
    this.ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      this.messages.push(m);
      if (m.type === "state") this.view = m.view;
    });
    this.send("resume");
  }
  send(type: string, extra: Record<string, unknown> = {}) {
    const m = {
      type,
      token: this.token,
      id: randomUUID(),
      version: this.view?.version,
      ...extra,
    };
    this.ws.send(JSON.stringify(m));
    return m;
  }
  async wait(predicate: () => boolean) {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error("Message timeout");
  }
  async change(type: string, extra: Record<string, unknown> = {}) {
    const v = this.view?.version || 0;
    this.send(type, extra);
    await this.wait(() => !!this.view && this.view.version > v);
  }
}
const guests = [new Guest(), new Guest(), new Guest()];
try {
  await start();
  for (const g of guests) await g.connect();
  const host = guests[0];
  await host.change("create", { name: "Host" });
  for (let i = 1; i < 3; i++)
    await guests[i].change("join", {
      name: "Guest " + i,
      code: host.view.code,
    });
  await host.wait(() => host.view.players.length === 3);
  for (const g of guests) {
    await g.wait(() => g.view.version === host.view.version);
    await g.change("ready");
    await host.wait(() => host.view.version === g.view.version);
  }
  await host.change("start");
  for (const g of guests) await g.wait(() => !!g.view.game);
  assert.equal(new Set(guests.flatMap((g) => g.view.hand)).size, 52);
  for (const g of guests) {
    const v = g.view;
    assert.equal(v.hand.length, v.players.find((p) => p.id === v.you)!.count);
    for (const p of v.players) assert.equal("hand" in p, false);
    assert.equal("waste" in v.game!, false);
    for (const other of guests)
      assert.equal(JSON.stringify(v).includes(other.token), false);
  }
  const actor = guests.find((g) => g.view.legal.includes("AS"))!;
  const before = actor.view.version;
  const command = actor.send("play", { card: "AS" });
  await actor.wait(() => actor.view.version > before);
  const accepted = actor.view.version;
  actor.ws.send(JSON.stringify(command));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(actor.view.version, accepted);
  actor.send("play", { card: "AS", version: before });
  await actor.wait(() =>
    actor.messages.some(
      (m) => m.type === "error" && m.message.includes("updated"),
    ),
  );
  assert.equal(actor.view.version, accepted);
  const snapshots = guests.map((g) => ({
    code: g.view.code,
    hand: [...g.view.hand],
    you: g.view.you,
  }));
  for (const g of guests) g.ws.close();
  await stop();
  await start();
  for (let i = 0; i < 3; i++) {
    const g = guests[i];
    g.messages = [];
    await g.connect();
    await g.wait(() => g.messages.some((m) => m.type === "state"));
    assert.equal(g.view.you, snapshots[i].you);
    assert.deepEqual(g.view.hand, snapshots[i].hand);
    assert.equal(g.view.code, snapshots[i].code);
  }
  const health = await fetch("http://localhost:3019/api/health");
  assert.deepEqual(await health.json(), { ok: true });
  const absent = guests.find((g) => g.view.you === host.view.game!.turn)!;
  const observer = guests.find((g) => g !== absent)!;
  const preTakeover = observer.view.version;
  absent.ws.close();
  await observer.wait(() => observer.view.version > preTakeover);
  assert.notEqual(observer.view.game!.turn, absent.view.you);
  absent.messages = [];
  await absent.connect();
  await absent.wait(() => absent.messages.some((m) => m.type === "state"));
  assert.equal(absent.view.you, snapshots[guests.indexOf(absent)].you);
  const oldHost = host.view.you;
  const successor = guests[1];
  await host.wait(() => host.view.version === absent.view.version);
  host.send("leave");
  await host.wait(() => host.messages.some((m) => m.type === "left"));
  await successor.wait(() => successor.view.host !== oldHost);
  assert.equal(successor.view.players.find((p) => p.id === oldHost)!.bot, true);
  host.send("create", { name: "New table" });
  await host.wait(() => host.view.code !== snapshots[0].code);
  assert.notEqual(host.view.code, snapshots[0].code);
  console.log(
    "PASS: guest rooms, readiness, start, unique private hands, duplicate rejection, stale rejection, restart recovery, disconnect takeover, seat reclaim, host transfer, new table, health.",
  );
} finally {
  for (const g of guests) g.ws?.close();
  if (server! && !server.killed) await stop();
  rmSync(data, { recursive: true, force: true });
}
