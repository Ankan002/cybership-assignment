import type { HttpClient } from "@/utils/http.client";
import { UPSAuthClient } from "./ups.auth";
import type { UPSCredentials } from "./ups.config";
import { utilsRegistry } from "@/utils";
import type { UPSRateRequest, UPSRateResponse } from "./ups.types";

export class UPSClient {
	private http: HttpClient;
	private auth: UPSAuthClient;

	constructor(credentials: UPSCredentials) {
		this.http = utilsRegistry.httpClient;
		this.auth = new UPSAuthClient(this.http, credentials);
	}

	async getRate(request: UPSRateRequest) {
		const token = await this.auth.getToken();

		return this.http.post<UPSRateRequest, UPSRateResponse>({
			url: "https://wwwcie.ups.com/api/rating/v1/rate", // TODO: make it pick from constants
			body: request,
			options: {
				headers: {
					Authorization: `Bearer ${token}`,
					transId: "test",
					transactionSrc: "integration-test",
				},
			},
		});
	}
}
