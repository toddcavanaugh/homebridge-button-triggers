import test from "node:test";
import assert from "node:assert/strict";
import { coerceBoolean, normalizeButtonEvent, parseRoute } from "../src/router";

test("parses modern button routes", () => {
  assert.deepEqual(parseRoute("/buttons/stream-lights-on"), {
    kind: "button",
    id: "stream-lights-on",
  });
});

test("parses legacy button routes", () => {
  assert.deepEqual(parseRoute("/button-stream-lights-on"), {
    kind: "legacy-button",
    id: "stream-lights-on",
  });
});

test("parses switch routes", () => {
  assert.deepEqual(parseRoute("/switches/stream-mode"), {
    kind: "switch-state",
    id: "stream-mode",
  });

  assert.deepEqual(parseRoute("/switches/stream-mode/toggle"), {
    kind: "switch-action",
    id: "stream-mode",
    action: "toggle",
  });
});

test("normalizes button event aliases", () => {
  assert.equal(normalizeButtonEvent("click"), "single");
  assert.equal(normalizeButtonEvent("double-click"), "double");
  assert.equal(normalizeButtonEvent("hold"), "long");
  assert.equal(normalizeButtonEvent("single"), "single");
  assert.equal(normalizeButtonEvent("nope"), undefined);
});

test("coerces booleans from common request values", () => {
  assert.equal(coerceBoolean(true), true);
  assert.equal(coerceBoolean(false), false);
  assert.equal(coerceBoolean("on"), true);
  assert.equal(coerceBoolean("0"), false);
  assert.equal(coerceBoolean(1), true);
  assert.equal(coerceBoolean(0), false);
  assert.equal(coerceBoolean("maybe"), undefined);
});
