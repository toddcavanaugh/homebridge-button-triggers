import {
  DEFAULT_HOST,
  DEFAULT_MOMENTARY_RESET_MS,
  DEFAULT_NAME,
  DEFAULT_PORT,
  LEGACY_PLATFORM_NAME,
  PLATFORM_NAME,
} from "./settings";
import {
  buildButtonIdentitySeed,
  buildSwitchIdentitySeed,
  hasAlphaNumeric,
  toQualifiedPlatformAlias,
  toRouteKey,
} from "./ids";
import type {
  NormalizedButtonConfig,
  NormalizedConfig,
  NormalizedSwitchConfig,
  PlatformAlias,
  RawButtonInput,
  RawPlatformConfig,
  RawSwitchInput,
  SwitchMode,
} from "./types";

export class ConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Configuration validation failed with ${issues.length} issue(s).`);
    this.name = "ConfigValidationError";
  }
}

export function normalizeConfig(input: unknown): NormalizedConfig {
  const raw = isRecord(input) ? (input as RawPlatformConfig) : {};
  const issues: string[] = [];

  const platformAlias = normalizePlatformAlias(raw.platform, issues);
  const name = normalizeOptionalString(raw.name, "name", issues) ?? DEFAULT_NAME;
  const host = normalizeOptionalString(raw.host, "host", issues) ?? DEFAULT_HOST;
  const port = normalizePort(raw.port, issues);
  const authToken = normalizeAuthToken(raw.authToken, issues);
  const legacyRoutes = normalizeLegacyRoutes(raw.legacyRoutes, issues);
  const buttons = normalizeButtons(raw.buttons, issues);
  const switches = normalizeSwitches(raw.switches, issues);

  assertUniqueRouteIds(buttons, "button", issues);
  assertUniqueRouteIds(switches, "switch", issues);

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    name,
    host,
    port,
    ...(authToken ? { authToken } : {}),
    legacyRoutes,
    platformAlias,
    buttons,
    switches,
  };
}

function normalizePlatformAlias(value: unknown, issues: string[]): PlatformAlias {
  const alias = toQualifiedPlatformAlias(value);

  if (alias == null || alias === PLATFORM_NAME) {
    return PLATFORM_NAME;
  }

  if (alias === LEGACY_PLATFORM_NAME) {
    return LEGACY_PLATFORM_NAME;
  }

  issues.push(
    `platform must be "${PLATFORM_NAME}" or "${LEGACY_PLATFORM_NAME}"; received ${stringifyValue(value)}.`,
  );

  return PLATFORM_NAME;
}

function normalizeOptionalString(value: unknown, field: string, issues: string[]): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string") {
    issues.push(`${field} must be a string; received ${stringifyValue(value)}.`);
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    issues.push(`${field} must not be empty.`);
    return undefined;
  }

  return normalized;
}

function normalizePort(value: unknown, issues: string[]): number {
  if (value == null) {
    return DEFAULT_PORT;
  }

  if (!Number.isInteger(value)) {
    issues.push(`port must be an integer between 1 and 65535; received ${stringifyValue(value)}.`);
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (port < 1 || port > 65535) {
    issues.push(`port must be between 1 and 65535; received ${port}.`);
    return DEFAULT_PORT;
  }

  return port;
}

function normalizeAuthToken(value: unknown, issues: string[]): string | undefined {
  if (value == null) {
    return undefined;
  }

  const token = normalizeOptionalString(value, "authToken", issues);
  return token;
}

function normalizeLegacyRoutes(value: unknown, issues: string[]): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value !== "boolean") {
    issues.push(`legacyRoutes must be a boolean; received ${stringifyValue(value)}.`);
    return false;
  }

  return value;
}

function normalizeButtons(value: unknown, issues: string[]): NormalizedButtonConfig[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(`buttons must be an array; received ${stringifyValue(value)}.`);
    return [];
  }

  return value.flatMap((button, index) => normalizeButton(button as RawButtonInput, index, issues));
}

function normalizeButton(value: RawButtonInput, index: number, issues: string[]): NormalizedButtonConfig[] {
  if (typeof value === "string") {
    const id = value.trim();
    if (id.length === 0) {
      issues.push(`buttons[${index}] must not be empty.`);
      return [];
    }

    return [createButtonDefinition(id, id, `buttons[${index}]`, issues)];
  }

  if (!isRecord(value)) {
    issues.push(`buttons[${index}] must be a string or object; received ${stringifyValue(value)}.`);
    return [];
  }

  const id = normalizeOptionalString(value.id, `buttons[${index}].id`, issues);
  if (id == null) {
    return [];
  }

  const name = normalizeOptionalString(value.name, `buttons[${index}].name`, issues) ?? id;
  return [createButtonDefinition(id, name, `buttons[${index}]`, issues)];
}

function createButtonDefinition(
  id: string,
  name: string,
  field: string,
  issues: string[],
): NormalizedButtonConfig {
  if (!hasAlphaNumeric(id)) {
    issues.push(`${field}.id must contain at least one letter or number.`);
  }

  return {
    id,
    name,
    routeId: toRouteKey(id),
    identitySeed: buildButtonIdentitySeed(id),
  };
}

function normalizeSwitches(value: unknown, issues: string[]): NormalizedSwitchConfig[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(`switches must be an array; received ${stringifyValue(value)}.`);
    return [];
  }

  return value.flatMap((entry, index) => normalizeSwitch(entry as RawSwitchInput, index, issues));
}

function normalizeSwitch(value: RawSwitchInput, index: number, issues: string[]): NormalizedSwitchConfig[] {
  if (!isRecord(value)) {
    issues.push(`switches[${index}] must be an object; received ${stringifyValue(value)}.`);
    return [];
  }

  const id = normalizeOptionalString(value.id, `switches[${index}].id`, issues);
  if (id == null) {
    return [];
  }

  if (!hasAlphaNumeric(id)) {
    issues.push(`switches[${index}].id must contain at least one letter or number.`);
  }

  const name = normalizeOptionalString(value.name, `switches[${index}].name`, issues) ?? id;
  const mode = normalizeSwitchMode(value.mode, index, issues);
  const resetAfterMs = normalizeResetAfterMs(value.resetAfterMs, index, mode, issues);
  const defaultState = normalizeDefaultState(value.defaultState, index, issues);

  return [
    {
      id,
      name,
      routeId: toRouteKey(id),
      identitySeed: buildSwitchIdentitySeed(id),
      mode,
      resetAfterMs,
      defaultState,
    },
  ];
}

function normalizeSwitchMode(value: unknown, index: number, issues: string[]): SwitchMode {
  if (value == null) {
    return "stateful";
  }

  if (value === "stateful" || value === "momentary") {
    return value;
  }

  issues.push(
    `switches[${index}].mode must be "stateful" or "momentary"; received ${stringifyValue(value)}.`,
  );

  return "stateful";
}

function normalizeResetAfterMs(
  value: unknown,
  index: number,
  mode: SwitchMode,
  issues: string[],
): number {
  if (value == null) {
    return DEFAULT_MOMENTARY_RESET_MS;
  }

  if (!Number.isInteger(value)) {
    issues.push(`switches[${index}].resetAfterMs must be an integer; received ${stringifyValue(value)}.`);
    return DEFAULT_MOMENTARY_RESET_MS;
  }

  const resetAfterMs = Number(value);
  if (resetAfterMs < 1 && mode === "momentary") {
    issues.push(`switches[${index}].resetAfterMs must be at least 1 for momentary switches.`);
    return DEFAULT_MOMENTARY_RESET_MS;
  }

  if (resetAfterMs < 0) {
    issues.push(`switches[${index}].resetAfterMs must not be negative.`);
    return DEFAULT_MOMENTARY_RESET_MS;
  }

  return resetAfterMs;
}

function normalizeDefaultState(value: unknown, index: number, issues: string[]): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value !== "boolean") {
    issues.push(`switches[${index}].defaultState must be a boolean; received ${stringifyValue(value)}.`);
    return false;
  }

  return value;
}

function assertUniqueRouteIds(
  entries: Array<{ id: string; routeId: string }>,
  kind: "button" | "switch",
  issues: string[],
): void {
  const seen = new Map<string, string>();

  for (const entry of entries) {
    const previous = seen.get(entry.routeId);
    if (previous != null) {
      issues.push(
        `${kind} IDs must be unique after normalization. ${stringifyValue(previous)} and ${stringifyValue(entry.id)} both map to ${stringifyValue(entry.routeId)}.`,
      );
      continue;
    }

    seen.set(entry.routeId, entry.id);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function stringifyValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
