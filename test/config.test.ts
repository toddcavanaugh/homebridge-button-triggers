import test from "node:test";
import assert from "node:assert/strict";
import { ConfigValidationError, normalizeConfig } from "../src/config";

test("normalizes legacy button-platform config", () => {
  const config = normalizeConfig({
    platform: "button-platform",
    name: "Button Platform",
    port: 3001,
    buttons: ["stream-lights-on", "stream-lights-off"],
  });

  assert.equal(config.platformAlias, "button-platform");
  assert.equal(config.legacyRoutes, false);
  assert.deepEqual(
    config.buttons.map((button) => ({ id: button.id, routeId: button.routeId, identitySeed: button.identitySeed })),
    [
      {
        id: "stream-lights-on",
        routeId: "stream-lights-on",
        identitySeed: "stream-lights-on",
      },
      {
        id: "stream-lights-off",
        routeId: "stream-lights-off",
        identitySeed: "stream-lights-off",
      },
    ],
  );
});

test("button identity normalization preserves legacy replacement behavior", () => {
  const config = normalizeConfig({
    platform: "ButtonTriggers",
    buttons: [{ id: "Stream  Lights On" }],
  });

  assert.equal(config.buttons[0]?.routeId, "stream--lights-on");
  assert.equal(config.buttons[0]?.identitySeed, "stream--lights-on");
});

test("switch defaults are applied", () => {
  const config = normalizeConfig({
    platform: "ButtonTriggers",
    switches: [{ id: "stream-mode" }],
  });

  assert.deepEqual(config.switches[0], {
    id: "stream-mode",
    name: "stream-mode",
    routeId: "stream-mode",
    identitySeed: "switch:stream-mode",
    mode: "stateful",
    resetAfterMs: 1000,
    defaultState: false,
  });
});

test("legacy routes can still be enabled explicitly", () => {
  const config = normalizeConfig({
    platform: "ButtonTriggers",
    legacyRoutes: true,
    buttons: [{ id: "stream-lights-on" }],
  });

  assert.equal(config.legacyRoutes, true);
});

test("duplicate normalized button ids are rejected", () => {
  assert.throws(
    () =>
      normalizeConfig({
        buttons: [{ id: "Stream Lights" }, { id: "stream-lights" }],
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.issues.join("\n"), /both map to/);
      return true;
    },
  );
});
