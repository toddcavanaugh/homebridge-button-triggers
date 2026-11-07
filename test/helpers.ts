import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { TestContext } from "node:test";
import type { API, Logger, PlatformAccessory, PlatformConfig } from "homebridge";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ButtonTriggersPlatform } from "../src/platform";
import type { NormalizedConfig } from "../src/types";

export async function fixture(t: TestContext, config: Record<string, unknown> = {}) {
  const require = createRequire(__filename);
  const module = await import(pathToFileURL(join(dirname(require.resolve("homebridge")), "api.js")).href);
  const real = new module.HomebridgeAPI() as API;
  const directory = await mkdtemp(join(tmpdir(), "button-triggers-integration-"));
  const added: PlatformAccessory[] = [];
  const removed: PlatformAccessory[] = [];
  const errors: unknown[][] = [];
  const warnings: unknown[][] = [];
  const api = Object.assign(new EventEmitter(), {
    hap: real.hap,
    platformAccessory: real.platformAccessory,
    user: { storagePath: () => directory },
    registerPlatformAccessories: (_plugin: string, _platform: string, accessories: PlatformAccessory[]) => added.push(...accessories),
    unregisterPlatformAccessories: (_plugin: string, _platform: string, accessories: PlatformAccessory[]) => removed.push(...accessories),
    updatePlatformAccessories: () => undefined,
  });
  const log = { info() {}, warn: (...args: unknown[]) => warnings.push(args), error: (...args: unknown[]) => errors.push(args) } as unknown as Logger;
  const platform = new ButtonTriggersPlatform(log, {
    platform: "ButtonTriggers", host: "127.0.0.1", authToken: "test-secret", ...config,
  } as PlatformConfig, api as unknown as API);
  const internal = platform as unknown as {
    normalizedConfig?: NormalizedConfig;
    launchTask: Promise<void>;
    server?: Server;
    handleShutdown(): Promise<void>;
  };
  if (internal.normalizedConfig) internal.normalizedConfig.port = 0;
  t.after(async () => { await internal.handleShutdown(); await rm(directory, { recursive: true, force: true }); });
  return {
    platform, api, directory, added, removed, errors, warnings, internal,
    async start() { api.emit("didFinishLaunching"); await internal.launchTask; },
    async request(path: string, init: RequestInit = {}, authenticated = true) {
      const address = internal.server?.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        ...init, headers: { ...(authenticated ? { Authorization: "Bearer test-secret" } : {}), ...init.headers },
      });
      return response as Omit<Response, "json"> & { json(): Promise<{ state: boolean }> };
    },
  };
}
