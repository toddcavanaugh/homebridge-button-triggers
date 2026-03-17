import type { API } from "homebridge";
import { ButtonTriggersPlatform } from "./platform";
import { LEGACY_PLATFORM_NAME, PLATFORM_NAME, PLUGIN_NAME } from "./settings";

export default function register(api: API): void {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ButtonTriggersPlatform);
  api.registerPlatform(PLUGIN_NAME, LEGACY_PLATFORM_NAME, ButtonTriggersPlatform);
}
