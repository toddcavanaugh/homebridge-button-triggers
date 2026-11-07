import type { API, PlatformAccessory, Service as HomebridgeService } from "homebridge";
import type { NormalizedSwitchConfig } from "../types";
import { StateStore } from "../state-store";

interface HapContext {
  Service: API["hap"]["Service"];
  Characteristic: API["hap"]["Characteristic"];
}

export class VirtualSwitchAccessory {
  private readonly service: HomebridgeService;
  private currentState: boolean;
  private operations: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private resetTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly hap: HapContext,
    private readonly accessory: PlatformAccessory,
    readonly definition: NormalizedSwitchConfig,
    private readonly stateStore: StateStore,
  ) {
    this.accessory.displayName = definition.name;

    this.accessory
      .getService(this.hap.Service.AccessoryInformation)
      ?.setCharacteristic(this.hap.Characteristic.Manufacturer, "Homebridge Button Triggers")
      .setCharacteristic(this.hap.Characteristic.Model, "Virtual Switch")
      .setCharacteristic(this.hap.Characteristic.SerialNumber, definition.identitySeed);

    this.currentState =
      definition.mode === "stateful"
        ? (this.stateStore.get(definition.routeId) ?? definition.defaultState)
        : definition.defaultState;

    this.service =
      this.accessory.getService(this.hap.Service.Switch) ??
      this.accessory.addService(this.hap.Service.Switch, definition.name);

    this.service.setCharacteristic(this.hap.Characteristic.Name, definition.name);
    this.service
      .getCharacteristic(this.hap.Characteristic.On)
      .onGet(() => this.currentState)
      .onSet(async (value) => {
        await this.setState(Boolean(value), { fromHomeKit: true });
      });

    this.service.updateCharacteristic(this.hap.Characteristic.On, this.currentState);
  }

  getState(): boolean {
    return this.currentState;
  }

  async turnOn(): Promise<boolean> {
    return this.setState(true);
  }

  async turnOff(): Promise<boolean> {
    return this.setState(false);
  }

  async toggle(): Promise<boolean> {
    return this.enqueue(() => !this.currentState);
  }

  async setState(nextState: boolean, options: { fromHomeKit?: boolean } = {}): Promise<boolean> {
    return this.enqueue(() => nextState, options);
  }

  async shutdown(): Promise<void> {
    this.stopped = true;
    this.clearResetTimer();
    await this.operations;
  }

  private enqueue(next: () => boolean, options: { fromHomeKit?: boolean } = {}): Promise<boolean> {
    if (this.stopped) return Promise.reject(new Error("Switch is shutting down."));
    const operation = this.operations.then(async () => {
      const nextState = next();
      if (this.definition.mode === "stateful") {
        await this.stateStore.set(this.definition.routeId, nextState);
      }
      this.currentState = nextState;
      if (!options.fromHomeKit) {
        this.service.updateCharacteristic(this.hap.Characteristic.On, nextState);
      }
      this.clearResetTimer();
      if (this.definition.mode === "momentary" && nextState !== this.definition.defaultState && !this.stopped) {
        this.scheduleReset();
      }
      return nextState;
    });
    this.operations = operation.catch(() => undefined);
    return operation;
  }

  private scheduleReset(): void {
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => {
      // Momentary resets are memory-only; shutdown cancels this timer.
      void this.setState(this.definition.defaultState).catch(() => undefined);
    }, this.definition.resetAfterMs);
    this.resetTimer.unref?.();
  }

  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }
}
