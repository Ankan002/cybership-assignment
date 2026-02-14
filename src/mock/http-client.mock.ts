import authSuccess from "../../tests/fixtures/auth/ups.auth.success.json";
import rateSuccess from "../../tests/fixtures/rate/ups.rate.success.json";

export class MockHttpClient {
	private callCount = 0;

	async post(options: any) {
		this.callCount++;

		// First call → auth
		if (this.callCount === 1) {
			console.log("🔐 Mock auth request");
			return authSuccess;
		}

		// Second call → rate request
		console.log("📦 Mock rate request");
		return rateSuccess;
	}
}
