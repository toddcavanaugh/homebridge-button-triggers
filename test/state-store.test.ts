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
