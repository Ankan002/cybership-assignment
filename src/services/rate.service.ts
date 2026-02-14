import type { RateRequest, RateQuote } from "@/models/rate";
import {
	CarrierFactory,
	type CarrierFactoryConfig,
} from "../carriers/carrier.factory";
import type { CarrierName } from "@/models/carrier";

export class RateService {
	constructor(private carrierConfig: CarrierFactoryConfig) {}

	async getRates(request: RateRequest): Promise<RateQuote[]> {
		const carrier = CarrierFactory.create(
			request.carrier as CarrierName,
			this.carrierConfig,
		);

		return carrier.getRates(request);
	}
}
