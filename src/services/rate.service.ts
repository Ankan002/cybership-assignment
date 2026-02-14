import {
	CarrierFactory,
	type CarrierFactoryConfig,
} from "@/carriers/carrier.factory";
import type { HttpClient } from "@/utils/http.client";
import type { RateRequest } from "@/models/rate";
import type { CarrierName } from "@/models/carrier";

export class RateService {
	private carriers = new Map<string, any>();

	constructor(
		private carrierConfig: CarrierFactoryConfig,
		private http?: HttpClient,
	) {}

	async getRates(request: RateRequest) {
		let carrier = this.carriers.get(request.carrier);

		if (!carrier) {
			carrier = CarrierFactory.create(
				request.carrier as CarrierName,
				this.carrierConfig,
				this.http,
			);

			this.carriers.set(request.carrier, carrier);
		}

		return carrier.getRates(request);
	}
}
