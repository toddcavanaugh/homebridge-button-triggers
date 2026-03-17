export type ButtonEvent = "single" | "double" | "long";
export type SwitchMode = "stateful" | "momentary";
export type PlatformAlias = "ButtonTriggers" | "button-platform";

export type RawButtonInput = string | RawButtonObject;

export interface RawButtonObject {
  id?: unknown;
  name?: unknown;
}

export interface RawSwitchInput {
  id?: unknown;
  name?: unknown;
  mode?: unknown;
  resetAfterMs?: unknown;
  defaultState?: unknown;
}

export interface RawPlatformConfig {
  platform?: unknown;
  name?: unknown;
  host?: unknown;
  port?: unknown;
  authToken?: unknown;
  legacyRoutes?: unknown;
  buttons?: unknown;
  switches?: unknown;
}

export interface NormalizedButtonConfig {
  id: string;
  name: string;
  routeId: string;
  identitySeed: string;
}

export interface NormalizedSwitchConfig {
  id: string;
  name: string;
  routeId: string;
  identitySeed: string;
  mode: SwitchMode;
  resetAfterMs: number;
  defaultState: boolean;
}

export interface NormalizedConfig {
  name: string;
  host: string;
  port: number;
  authToken?: string;
  legacyRoutes: boolean;
  platformAlias: PlatformAlias;
  buttons: NormalizedButtonConfig[];
  switches: NormalizedSwitchConfig[];
}

export interface AccessoryContext {
  kind: "button" | "switch";
  id: string;
  routeId: string;
  name: string;
  identitySeed: string;
  mode?: SwitchMode;
  resetAfterMs?: number;
  defaultState?: boolean;
}

export type ParsedRoute =
  | { kind: "health" }
  | { kind: "button"; id: string }
  | { kind: "legacy-button"; id: string }
  | { kind: "switch-state"; id: string }
  | { kind: "switch-action"; id: string; action: "on" | "off" | "toggle" | "set" }
  | { kind: "not-found" };

export interface PersistedStateFile {
  version: 1;
  switches: Record<string, boolean>;
}
