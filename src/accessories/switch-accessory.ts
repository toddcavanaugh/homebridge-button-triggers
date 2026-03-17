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
    return this.setState(!this.currentState);
  }

  async setState(nextState: boolean, options: { fromHomeKit?: boolean } = {}): Promise<boolean> {
    this.currentState = nextState;

    if (!options.fromHomeKit) {
      this.service.updateCharacteristic(this.hap.Characteristic.On, this.currentState);
    }

    if (this.definition.mode === "stateful") {
      await this.stateStore.set(this.definition.routeId, this.currentState);
      this.clearResetTimer();
      return this.currentState;
    }

    await this.stateStore.delete(this.definition.routeId);

    if (this.currentState === this.definition.defaultState) {
      this.clearResetTimer();
      return this.currentState;
    }

    this.scheduleReset();
    return this.currentState;
  }

  shutdown(): void {
    this.clearResetTimer();
  }

  private scheduleReset(): void {
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => {
      void this.setState(this.definition.defaultState);
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
