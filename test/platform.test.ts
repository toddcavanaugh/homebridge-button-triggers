import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fixture } from "./helpers";
import { STATE_STORE_FILENAME } from "../src/settings";

const devices = { buttons: [{ id: "scene" }], switches: [{ id: "saved" }, { id: "pulse", mode: "momentary", resetAfterMs: 80 }] };

test("HTTP authentication, payloads, event delivery, and errors", async t => {
  const f = await fixture(t, devices); await f.start();
  assert.equal((await f.request("/health", {}, false)).status, 200);
  assert.equal((await f.request("/switches/saved", {}, false)).status, 401);
  assert.equal((await f.request("/switches/saved?token=test-secret", {}, false)).status, 200);
  const button = f.added.find(a => a.displayName === "scene")!;
  const characteristic = button.getService(f.api.hap.Service.StatelessProgrammableSwitch)!.getCharacteristic(f.api.hap.Characteristic.ProgrammableSwitchEvent);
  const events: unknown[] = [];
  characteristic.on("change", change => events.push(change.newValue));
  for (const event of ["single", "single", "double", "long"]) assert.equal((await f.request(`/buttons/scene?event=${event}`)).status, 200);
  assert.deepEqual(events, [0, 0, 1, 2]);
  assert.equal((await f.request("/buttons/scene?event=constructor")).status, 422);
  assert.equal((await f.request("/buttons/%ZZ?event=single")).status, 400);
  assert.equal((await f.request("/unknown")).status, 404);
  assert.equal((await f.request("/switches/saved", { method: "DELETE" })).status, 405);
  assert.equal((await f.request("/switches/saved/set")).status, 405);
  assert.equal((await f.request("/button-scene?event=click")).status, 404);
  for (const body of ["broken", "null", "[]", '{"state":"maybe"}']) {
    assert.equal((await f.request("/switches/saved/set", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status, 422);
  }
  const set = await f.request("/switches/saved/set", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "state=on" });
  assert.equal((await set.json()).state, true);
  assert.equal(f.errors.length, 0);
});

test("concurrent HTTP toggles persist and survive restart", async t => {
  const f = await fixture(t, devices); await f.start();
  const responses = await Promise.all(Array.from({ length: 40 }, () => f.request("/switches/saved/toggle")));
  assert.ok(responses.every(r => r.status === 200));
  const states = await Promise.all(responses.map(r => r.json()));
  assert.equal(states.filter(s => s.state).length, 20);
  await f.request("/switches/saved/on");
  await f.internal.handleShutdown();
  const file = await readFile(join(f.directory, STATE_STORE_FILENAME), "utf8");
  assert.equal(JSON.parse(file).switches.saved, true);
  const restart = await fixture(t, devices);
  await writeFile(join(restart.directory, STATE_STORE_FILENAME), file);
  for (const accessory of f.added) restart.platform.configureAccessory(accessory);
  await restart.start();
  assert.equal(restart.added.length, 0);
  assert.equal((await (await restart.request("/switches/saved")).json()).state, true);
});

test("HomeKit writes, momentary retrigger, and timer shutdown", async t => {
  const f = await fixture(t, devices); await f.start();
  const saved = f.added.find(a => a.displayName === "saved")!;
  const on = saved.getService(f.api.hap.Service.Switch)!.getCharacteristic(f.api.hap.Characteristic.On);
  await on.handleSetRequest(true);
  assert.equal((await (await f.request("/switches/saved")).json()).state, true);
  await f.request("/switches/pulse/on"); await delay(45);
  await f.request("/switches/pulse/on"); await delay(45);
  assert.equal((await (await f.request("/switches/pulse")).json()).state, true);
  await delay(70);
  assert.equal((await (await f.request("/switches/pulse")).json()).state, false);
  await f.request("/switches/pulse/on");
  const pulse = f.added.find(a => a.displayName === "pulse")!.getService(f.api.hap.Service.Switch)!;
  await f.internal.handleShutdown(); await delay(100);
  assert.equal(pulse.getCharacteristic(f.api.hap.Characteristic.On).value, true);
});

test("failed persistence leaves live switch state unchanged and permits retry", async t => {
  const f = await fixture(t, devices); await f.start();
  const path = join(f.directory, STATE_STORE_FILENAME);
  await mkdir(path);
  assert.equal((await f.request("/switches/saved/on")).status, 500);
  assert.equal((await (await f.request("/switches/saved")).json()).state, false);
  await rm(path, { recursive: true });
  assert.equal((await f.request("/switches/saved/on")).status, 200);
});

test("empty configuration unregisters all cached accessories", async t => {
  const f = await fixture(t);
  const accessory = new f.api.platformAccessory("Old", f.api.hap.uuid.generate("old"));
  accessory.context = { kind: "switch", routeId: "old" };
  f.platform.configureAccessory(accessory);
  await writeFile(join(f.directory, STATE_STORE_FILENAME), JSON.stringify({ version: 1, switches: { old: true } }));
  await f.start();
  assert.equal(f.removed.length, 1); assert.equal(f.internal.server, undefined);
  assert.deepEqual(JSON.parse(await readFile(join(f.directory, STATE_STORE_FILENAME), "utf8")).switches, {});
});

test("corrupt state is preserved and accessories start with defaults", async t => {
  const f = await fixture(t, devices);
  await writeFile(join(f.directory, STATE_STORE_FILENAME), "{broken"); await f.start();
  const backup = (await readdir(f.directory)).find(n => n.includes(".corrupt-"))!;
  assert.equal(await readFile(join(f.directory, backup), "utf8"), "{broken");
  assert.equal(f.added.length, 3); assert.equal(f.warnings.length, 1);
  assert.equal((await (await f.request("/switches/saved")).json()).state, false);
});

test("legacy routes and qualified alias retain supported behavior", async t => {
  const f = await fixture(t, { platform: "homebridge-button-triggers.button-platform", legacyRoutes: true, buttons: ["scene"] });
  await f.start();
  assert.equal((await f.request("/button-scene?event=click")).status, 200);
});

test("shutdown during launch never leaves the listener running", async t => {
  const f = await fixture(t, devices);
  const start = f.start();
  await f.internal.handleShutdown(); await start;
  assert.equal(f.internal.server, undefined);
});

test("oversized POST returns a validation error instead of dropping the socket", async t => {
  const f = await fixture(t, devices); await f.start();
  const response = await f.request("/switches/saved/set", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: true, padding: "x".repeat(70 * 1024) }),
  });
  assert.equal(response.status, 422);
  assert.equal((await (await f.request("/switches/saved")).json()).state, false);
});

test("momentary mode discards previous persisted state and supports a true default", async t => {
  const f = await fixture(t, { switches: [{ id: "pulse", mode: "momentary", defaultState: true, resetAfterMs: 20 }] });
  await writeFile(join(f.directory, STATE_STORE_FILENAME), JSON.stringify({ version: 1, switches: { pulse: false } }));
  await f.start();
  assert.equal((await (await f.request("/switches/pulse")).json()).state, true);
  assert.deepEqual(JSON.parse(await readFile(join(f.directory, STATE_STORE_FILENAME), "utf8")).switches, {});
  await f.request("/switches/pulse/off"); await delay(60);
  assert.equal((await (await f.request("/switches/pulse")).json()).state, true);
});

test("display name changes retain identity and only removed devices are unregistered", async t => {
  const original = await fixture(t, { switches: [{ id: "keep" }, { id: "remove" }] }); await original.start();
  const kept = original.added.find(a => a.context.id === "keep")!;
  const updated = await fixture(t, { switches: [{ id: "keep", name: "New display name" }] });
  for (const accessory of original.added) updated.platform.configureAccessory(accessory);
  await updated.start();
  assert.equal(updated.added.length, 0); assert.equal(updated.removed.length, 1);
  assert.equal(kept.displayName, "New display name");
  assert.equal((await updated.request("/switches/keep")).status, 200);
  assert.equal((await updated.request("/switches/remove")).status, 404);
});
