import { HttpClient } from "@/utils/http.client";
import type { UPSCredentials } from "./ups.config";

interface TokenResponse {
	access_token: string;
	expires_in: number;
}

interface FetchTokenRequestBody {
	grant_type: "client_credentials";
}

export class UPSAuthClient {
	private token?: string;
	private expiry?: number;

	constructor(
		private http: HttpClient,
		private credentials: UPSCredentials,
	) {}

	async getToken(): Promise<string> {
		if (this.token && this.expiry && Date.now() < this.expiry) {
			return this.token;
		}

		const res = await this.fetchToken();

		this.token = res.access_token;
		this.expiry = Date.now() + res.expires_in * 1000 - 60_000;

		return this.token;
	}

	private async fetchToken(): Promise<TokenResponse> {
		const auth = Buffer.from(
			`${this.credentials.clientId}:${this.credentials.clientSecret}`,
		).toString("base64");

		return this.http.post<FetchTokenRequestBody, TokenResponse>({
			url: "https://wwwcie.ups.com/security/v1/oauth/token", // TODO: make it pick from constants
			body: {
				grant_type: "client_credentials",
			},
			options: {
				headers: {
					Authorization: `Basic ${auth}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
			},
		});
	}
}
