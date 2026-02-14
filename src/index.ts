import { RateService } from "./services/rate.service";
import { MockHttpClient } from "@/mock/http-client.mock";

async function main() {
	console.log("🚀 Running mocked UPS rate flow...");

	const mockHttp = new MockHttpClient();

	const service = new RateService(
		{
			ups: {
				clientId: "mock",
				clientSecret: "mock",
			},
		},
		mockHttp as any,
	);

	const request = {
		carrier: "ups",
		origin: {
			addressLine1: "Origin Street",
			city: "New York",
			postalCode: "10001",
			countryCode: "US",
		},
		destination: {
			addressLine1: "Dest Street",
			city: "Los Angeles",
			postalCode: "90001",
			countryCode: "US",
		},
		packages: [
			{
				weight: { value: 1, unit: "LBS" },
			},
		],
	};

	const rates = await service.getRates(request as any);

	console.log("✅ Rates:");
	console.log(JSON.stringify(rates, null, 2));
}

main();
