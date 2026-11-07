import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state-store";

test("state store saves and reloads switch state", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "button-triggers-"));
  const filePath = join(tempDir, "state.json");

  const store = new StateStore(filePath);
  await store.load();
  await store.set("stream-mode", true);

  const persisted = JSON.parse(await readFile(filePath, "utf8")) as {
    version: number;
    switches: Record<string, boolean>;
  };

  assert.equal(persisted.version, 1);
  assert.equal(persisted.switches["stream-mode"], true);

  const reloaded = new StateStore(filePath);
  await reloaded.load();
  assert.equal(reloaded.get("stream-mode"), true);

  await reloaded.delete("stream-mode");
  assert.equal(reloaded.get("stream-mode"), undefined);
});

test("concurrent writes combine safely and unchanged values avoid disk writes", async t => {
  const { stat, rm } = await import("node:fs/promises");
  const directory = await mkdtemp(join(tmpdir(), "button-triggers-concurrent-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "state.json"); const store = new StateStore(path);
  await Promise.all(Array.from({ length: 100 }, (_, i) => store.set(`switch-${i}`, true)));
  await store.flush();
  assert.equal(Object.keys(JSON.parse(await readFile(path, "utf8")).switches).length, 100);
  const before = await stat(path);
  await store.set("switch-0", true); await store.delete("absent");
  assert.equal((await stat(path)).ino, before.ino);
  await Promise.all(Array.from({ length: 100 }, (_, i) => store.delete(`switch-${i}`)));
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).switches, {});
});

test("failed writes roll back memory and the queue recovers", async t => {
  const { mkdir, rm } = await import("node:fs/promises");
  const directory = await mkdtemp(join(tmpdir(), "button-triggers-failure-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "state.json"); await mkdir(path);
  const store = new StateStore(path);
  await assert.rejects(store.set("saved", true));
  assert.equal(store.get("saved"), undefined);
  await rm(path, { recursive: true });
  await store.set("saved", true); assert.equal(store.get("saved"), true);
});
