import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import {
  API,
  APIEvent,
  type DynamicPlatformPlugin,
  type Logger,
  type PlatformAccessory,
  type PlatformConfig,
} from "homebridge";
import { ButtonAccessory } from "./accessories/button-accessory";
import { VirtualSwitchAccessory } from "./accessories/switch-accessory";
import { ConfigValidationError, normalizeConfig } from "./config";
import { normalizeIdentifier } from "./ids";
import { RequestBodyParseError, coerceBoolean, extractRequestToken, normalizeButtonEvent, parseRoute, readRequestBody } from "./router";
import {
  LEGACY_PLATFORM_NAME,
  PLATFORM_NAME,
  PLUGIN_NAME,
  STATE_STORE_FILENAME,
} from "./settings";
import { StateStore } from "./state-store";
import type {
  AccessoryContext,
  NormalizedButtonConfig,
  NormalizedConfig,
  NormalizedSwitchConfig,
} from "./types";

export class ButtonTriggersPlatform implements DynamicPlatformPlugin {
  readonly Service: API["hap"]["Service"];
  readonly Characteristic: API["hap"]["Characteristic"];

  private readonly cachedAccessories = new Map<string, PlatformAccessory<AccessoryContext>>();
  private readonly buttons = new Map<string, ButtonAccessory>();
  private readonly switches = new Map<string, VirtualSwitchAccessory>();
  private readonly normalizedConfig?: NormalizedConfig;
  private readonly registration: { pluginIdentifier: string; platformName: string };

  private readonly stateStore: StateStore;
  private server: Server | undefined;
  private disabled = false;

  constructor(
    readonly log: Logger,
    readonly config: PlatformConfig,
    readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.registration = this.resolveRegistrationIdentity(config.platform);
    this.stateStore = new StateStore(join(this.api.user.storagePath(), STATE_STORE_FILENAME));

    try {
      this.normalizedConfig = normalizeConfig(config);
    } catch (error) {
      this.disabled = true;
      if (error instanceof ConfigValidationError) {
        this.log.error("Invalid configuration for %s:", PLATFORM_NAME);
        for (const issue of error.issues) {
          this.log.error(`- ${issue}`);
        }
      } else {
        this.log.error("Failed to normalize configuration: %s", this.formatError(error));
      }
    }

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      void this.handleDidFinishLaunching();
    });

    this.api.on(APIEvent.SHUTDOWN, () => {
      void this.handleShutdown();
    });
  }

  configureAccessory(accessory: PlatformAccessory<AccessoryContext>): void {
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private async handleDidFinishLaunching(): Promise<void> {
    if (this.disabled || this.normalizedConfig == null) {
      return;
    }

    try {
      await this.stateStore.load();
      this.logStartupSummary(this.normalizedConfig);

      if (this.normalizedConfig.buttons.length === 0 && this.normalizedConfig.switches.length === 0) {
        this.log.warn("No buttons or switches configured. HTTP server will not start until the plugin is configured.");
        return;
      }

      this.syncAccessories(this.normalizedConfig);
      await this.startServer(this.normalizedConfig);
    } catch (error) {
      this.log.error("Startup failed: %s", this.formatError(error));
    }
  }

  private async handleShutdown(): Promise<void> {
    for (const accessory of this.switches.values()) {
      accessory.shutdown();
    }

    this.switches.clear();
    this.buttons.clear();

    if (this.server == null) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });

    this.server = undefined;
  }

  private syncAccessories(config: NormalizedConfig): void {
    const desiredUuids = new Set<string>();
    const createdAccessories: PlatformAccessory<AccessoryContext>[] = [];
    const updatedAccessories: PlatformAccessory<AccessoryContext>[] = [];

    for (const definition of config.buttons) {
      const uuid = this.generateUuid(definition.identitySeed);
      desiredUuids.add(uuid);

      const existingAccessory = this.cachedAccessories.get(uuid);
      const accessory = existingAccessory ?? new this.api.platformAccessory<AccessoryContext>(definition.name, uuid, this.api.hap.Categories.SWITCH);

      this.applyContext(accessory, definition, "button");
      this.buttons.set(definition.routeId, new ButtonAccessory(this, accessory, definition));

      if (existingAccessory == null) {
        createdAccessories.push(accessory);
      } else {
        updatedAccessories.push(accessory);
      }
    }

    for (const definition of config.switches) {
      const uuid = this.generateUuid(definition.identitySeed);
      desiredUuids.add(uuid);

      const existingAccessory = this.cachedAccessories.get(uuid);
      const accessory = existingAccessory ?? new this.api.platformAccessory<AccessoryContext>(definition.name, uuid, this.api.hap.Categories.SWITCH);

      this.applyContext(accessory, definition, "switch");
      this.switches.set(definition.routeId, new VirtualSwitchAccessory(this, accessory, definition, this.stateStore));

      if (existingAccessory == null) {
        createdAccessories.push(accessory);
      } else {
        updatedAccessories.push(accessory);
      }
    }

    const staleAccessories = [...this.cachedAccessories.values()].filter((accessory) => !desiredUuids.has(accessory.UUID));

    for (const staleAccessory of staleAccessories) {
      const routeId = staleAccessory.context.routeId;
      if (staleAccessory.context.kind === "switch" && routeId != null) {
        const existing = this.switches.get(routeId);
        existing?.shutdown();
        void this.stateStore.delete(routeId);
        this.switches.delete(routeId);
      }

      if (staleAccessory.context.kind === "button" && routeId != null) {
        this.buttons.delete(routeId);
      }

      this.cachedAccessories.delete(staleAccessory.UUID);
    }

    if (createdAccessories.length > 0) {
      this.api.registerPlatformAccessories(
        this.registration.pluginIdentifier,
        this.registration.platformName,
        createdAccessories,
      );
    }

    if (updatedAccessories.length > 0) {
      this.api.updatePlatformAccessories(updatedAccessories);
    }

    if (staleAccessories.length > 0) {
      this.api.unregisterPlatformAccessories(
        this.registration.pluginIdentifier,
        this.registration.platformName,
        staleAccessories,
      );
    }

    this.logRouteSummary(config);
  }

  private applyContext(
    accessory: PlatformAccessory<AccessoryContext>,
    definition: NormalizedButtonConfig | NormalizedSwitchConfig,
    kind: AccessoryContext["kind"],
  ): void {
    accessory.displayName = definition.name;
    const context: AccessoryContext = {
      kind,
      id: definition.id,
      routeId: definition.routeId,
      name: definition.name,
      identitySeed: definition.identitySeed,
    };

    if (kind === "switch") {
      const switchDefinition = definition as NormalizedSwitchConfig;
      context.mode = switchDefinition.mode;
      context.resetAfterMs = switchDefinition.resetAfterMs;
      context.defaultState = switchDefinition.defaultState;
    }

    accessory.context = context;
  }

  private async startServer(config: NormalizedConfig): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res, config);
    });

    this.server.on("error", (error) => {
      this.log.error("HTTP server error: %s", this.formatError(error));
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("listening", () => resolve());
      this.server?.once("error", reject);
      this.server?.listen(config.port, config.host);
    });

    this.log.info(
      "Listening on http://%s:%d (legacy routes %s, auth %s)",
      config.host,
      config.port,
      config.legacyRoutes ? "enabled" : "disabled",
      config.authToken ? "enabled" : "disabled",
    );
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    config: NormalizedConfig,
  ): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();

    if (method !== "GET" && method !== "POST") {
      this.sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${config.host}:${config.port}`}`);
      const route = parseRoute(url.pathname);

      if (route.kind === "not-found") {
        this.log.warn("Unhandled route: %s", url.pathname);
        this.sendJson(res, 404, { error: "Route not found." });
        return;
      }

      if (route.kind === "health") {
        this.sendJson(res, 200, {
          ok: true,
          name: config.name,
          authEnabled: Boolean(config.authToken),
          legacyRoutes: config.legacyRoutes,
          buttons: this.buttons.size,
          switches: this.switches.size,
        });
        return;
      }

      if (config.authToken && extractRequestToken(req.headers, url.searchParams) !== config.authToken) {
        this.log.warn("Unauthorized request for %s from %s", url.pathname, req.socket.remoteAddress ?? "unknown");
        this.sendJson(res, 401, { error: "Unauthorized." });
        return;
      }

      switch (route.kind) {
        case "button":
          await this.handleButtonRoute(route.id, req, res, url.searchParams, false);
          return;
        case "legacy-button":
          if (!config.legacyRoutes) {
            this.sendJson(res, 404, { error: "Legacy routes are disabled." });
            return;
          }

          await this.handleButtonRoute(route.id, req, res, url.searchParams, true);
          return;
        case "switch-state":
          this.handleSwitchStateRoute(route.id, res);
          return;
        case "switch-action":
          await this.handleSwitchActionRoute(route.id, route.action, req, res);
          return;
        default:
          this.sendJson(res, 404, { error: "Route not found." });
      }
    } catch (error) {
      if (error instanceof RequestBodyParseError) {
        this.sendJson(res, 422, { error: error.message });
        return;
      }

      this.log.error("Request handling failed: %s", this.formatError(error));
      this.sendJson(res, 500, { error: "Internal server error." });
    }
  }

  private async handleButtonRoute(
    id: string,
    req: IncomingMessage,
    res: ServerResponse,
    query: URLSearchParams,
    legacyRoute: boolean,
  ): Promise<void> {
    const button = this.buttons.get(normalizeIdentifier(id));
    if (button == null) {
      this.log.warn("Unknown button requested: %s", id);
      this.sendJson(res, 404, { error: "Button not found." });
      return;
    }

    const body = req.method === "POST" ? await readRequestBody(req) : {};
    const event = normalizeButtonEvent(query.get("event") ?? body.event);
    if (event == null) {
      this.sendJson(res, 422, { error: "Button event must be one of single, double, long or a supported legacy alias." });
      return;
    }

    button.triggerEvent(event);
    this.sendJson(res, 200, {
      ok: true,
      id: button.definition.id,
      routeId: button.definition.routeId,
      event,
      legacyRoute,
    });
  }

  private handleSwitchStateRoute(id: string, res: ServerResponse): void {
    const accessory = this.switches.get(normalizeIdentifier(id));
    if (accessory == null) {
      this.log.warn("Unknown switch requested: %s", id);
      this.sendJson(res, 404, { error: "Switch not found." });
      return;
    }

    this.sendJson(res, 200, {
      ok: true,
      id: accessory.definition.id,
      routeId: accessory.definition.routeId,
      state: accessory.getState(),
      mode: accessory.definition.mode,
      defaultState: accessory.definition.defaultState,
    });
  }

  private async handleSwitchActionRoute(
    id: string,
    action: "on" | "off" | "toggle" | "set",
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const accessory = this.switches.get(normalizeIdentifier(id));
    if (accessory == null) {
      this.log.warn("Unknown switch requested: %s", id);
      this.sendJson(res, 404, { error: "Switch not found." });
      return;
    }

    let state: boolean;

    switch (action) {
      case "on":
        state = await accessory.turnOn();
        break;
      case "off":
        state = await accessory.turnOff();
        break;
      case "toggle":
        state = await accessory.toggle();
        break;
      case "set": {
        if (req.method !== "POST") {
          this.sendJson(res, 405, { error: "Use POST /switches/:id/set with a state payload." });
          return;
        }

        const body = await readRequestBody(req);
        const parsedState = coerceBoolean(body.state);
        if (parsedState == null) {
          this.sendJson(res, 422, { error: "Switch state must be true or false." });
          return;
        }

        state = await accessory.setState(parsedState);
        break;
      }
    }

    this.sendJson(res, 200, {
      ok: true,
      id: accessory.definition.id,
      routeId: accessory.definition.routeId,
      state,
      mode: accessory.definition.mode,
    });
  }

  private sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(`${JSON.stringify(payload)}\n`);
  }

  private logStartupSummary(config: NormalizedConfig): void {
    this.log.info(
      "Config loaded: %d button(s), %d switch(es), platform alias %s.",
      config.buttons.length,
      config.switches.length,
      config.platformAlias,
    );
  }

  private logRouteSummary(config: NormalizedConfig): void {
    for (const button of config.buttons) {
      this.log.info("Button route: GET/POST /buttons/%s?event=single", button.routeId);
      if (config.legacyRoutes) {
        this.log.info("Legacy button route: GET/POST /button-%s?event=click", button.routeId);
      }
    }

    for (const accessory of config.switches) {
      this.log.info("Switch routes: GET /switches/%s, /on, /off, /toggle and POST /set", accessory.routeId);
    }
  }

  private resolveRegistrationIdentity(platformValue: unknown): { pluginIdentifier: string; platformName: string } {
    const normalized = typeof platformValue === "string" && platformValue.includes(".")
      ? platformValue.split(".").at(-1)
      : platformValue;

    if (normalized === LEGACY_PLATFORM_NAME) {
      return {
        pluginIdentifier: PLUGIN_NAME,
        platformName: LEGACY_PLATFORM_NAME,
      };
    }

    return {
      pluginIdentifier: PLUGIN_NAME,
      platformName: PLATFORM_NAME,
    };
  }

  private generateUuid(seed: string): string {
    return this.api.hap.uuid.generate(seed).toUpperCase();
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.stack ?? error.message;
    }

    return String(error);
  }
}
