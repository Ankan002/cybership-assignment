import type { Address } from "./address";
import type { Money } from "./money";
import type { Package } from "./package";

export interface RateRequest {
	carrier: string;

	origin: Address;
	destination: Address;

	packages: Package[];

	serviceLevel?: string;
}

export interface RateQuote {
	carrier: string;
	serviceCode: string;
	serviceName: string;

	totalCharge: Money;

	estimatedDays?: number;
}
