import { type Carrier } from "../carrier.interface";
import type { RateRequest, RateQuote } from "@/models/rate";
import { UPSClient } from "./ups.client";
import type { UPSCredentials } from "./ups.config";
import { mapToUPSRateRequest, mapFromUPSRateResponse } from "./ups.mapper";
import type { HttpClient } from "@/utils/http.client";

export class UPSCarrier implements Carrier {
	private client: UPSClient;

	constructor(credentials: UPSCredentials, http?: HttpClient) {
		this.client = new UPSClient(credentials, http);
	}

	async getRates(request: RateRequest): Promise<RateQuote[]> {
		const payload = mapToUPSRateRequest(request);

		const response = await this.client.getRate(payload);

		return mapFromUPSRateResponse(response);
	}
}
