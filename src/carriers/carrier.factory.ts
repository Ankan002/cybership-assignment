import type { CarrierName } from "@/models/carrier";
import type { Carrier } from "./carrier.interface";
import type { UPSCredentials } from "./ups/ups.config";
import { UPSCarrier } from "./ups/ups.carrier";

export interface CarrierFactoryConfig {
	ups?: UPSCredentials;
}

type CarrierBuilder = (config: CarrierFactoryConfig) => Carrier;

const registry: Record<CarrierName, CarrierBuilder> = {
	ups: (config) => {
		if (!config.ups) {
			throw new Error("UPS credentials missing");
		}

		return new UPSCarrier(config.ups);
	},
};

export class CarrierFactory {
	static create(name: CarrierName, config: CarrierFactoryConfig): Carrier {
		const builder = registry[name];

		if (!builder) {
			throw new Error(`Unsupported carrier: ${name}`);
		}

		return builder(config);
	}
}
