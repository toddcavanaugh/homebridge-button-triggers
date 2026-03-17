import type {
  API,
  CharacteristicValue,
  PlatformAccessory,
  Service as HomebridgeService,
} from "homebridge";
import type { ButtonEvent, NormalizedButtonConfig } from "../types";

interface HapContext {
  Service: API["hap"]["Service"];
  Characteristic: API["hap"]["Characteristic"];
}

type EventCharacteristic = {
  setProps: (props: { minValue?: number; maxValue?: number; validValues?: number[] }) => void;
  sendEventNotification?: (value: CharacteristicValue) => void;
  updateValue: (value: CharacteristicValue) => unknown;
};

export class ButtonAccessory {
  private readonly service: HomebridgeService;
  private readonly eventCharacteristic: EventCharacteristic;

  constructor(
    private readonly hap: HapContext,
    private readonly accessory: PlatformAccessory,
    readonly definition: NormalizedButtonConfig,
  ) {
    this.accessory.displayName = definition.name;

    this.accessory
      .getService(this.hap.Service.AccessoryInformation)
      ?.setCharacteristic(this.hap.Characteristic.Manufacturer, "Homebridge Button Triggers")
      .setCharacteristic(this.hap.Characteristic.Model, "Virtual Button")
      .setCharacteristic(this.hap.Characteristic.SerialNumber, definition.identitySeed);

    this.service =
      this.accessory.getService(this.hap.Service.StatelessProgrammableSwitch) ??
      this.accessory.addService(this.hap.Service.StatelessProgrammableSwitch, `${definition.name} Switch`);

    this.service.setCharacteristic(this.hap.Characteristic.Name, `${definition.name} Switch`);

    this.eventCharacteristic = this.service.getCharacteristic(
      this.hap.Characteristic.ProgrammableSwitchEvent,
    ) as unknown as EventCharacteristic;

    this.eventCharacteristic.setProps({
      minValue: this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
      maxValue: this.hap.Characteristic.ProgrammableSwitchEvent.LONG_PRESS,
      validValues: [
        this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
        this.hap.Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS,
        this.hap.Characteristic.ProgrammableSwitchEvent.LONG_PRESS,
      ],
    });
  }

  triggerEvent(event: ButtonEvent): void {
    const value = this.toCharacteristicValue(event);
    if (typeof this.eventCharacteristic.sendEventNotification === "function") {
      this.eventCharacteristic.sendEventNotification(value);
      return;
    }

    this.eventCharacteristic.updateValue(value);
  }

  private toCharacteristicValue(event: ButtonEvent): CharacteristicValue {
    switch (event) {
      case "single":
        return this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
      case "double":
        return this.hap.Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS;
      case "long":
        return this.hap.Characteristic.ProgrammableSwitchEvent.LONG_PRESS;
    }
  }
}
