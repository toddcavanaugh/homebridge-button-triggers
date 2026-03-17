export const PLUGIN_NAME = "homebridge-button-triggers";
export const PLATFORM_NAME = "ButtonTriggers";
export const LEGACY_PLUGIN_NAME = "homebridge-button-platform";
export const LEGACY_PLATFORM_NAME = "button-platform";

export const DEFAULT_NAME = "Button Triggers";
export const DEFAULT_HOST = "0.0.0.0";
export const DEFAULT_PORT = 3001;
export const DEFAULT_MOMENTARY_RESET_MS = 1000;
export const STATE_STORE_FILENAME = "homebridge-button-triggers-state.json";

export const BUTTON_EVENT_ALIASES = {
  single: "single",
  click: "single",
  "single-press": "single",
  double: "double",
  "double-click": "double",
  "double-press": "double",
  long: "long",
  hold: "long",
  "long-press": "long",
} as const;
