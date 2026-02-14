import { describe, test, expect, mock, beforeEach } from "bun:test";

import { RateService } from "@/services/rate.service";

import authSuccess from "../fixtures/auth/ups.auth.success.json";
import rateSuccess from "../fixtures/rate/ups.rate.success.json";
import rateMalformed from "../fixtures/rate/ups.rate.malformed.json";

/**
 * Mock HTTP layer
 * We mock only HttpClient.post
 * Everything else runs real code.
 */
const mockPost = mock();

const mockHttp = {
	post: mockPost,
};

/**
 * Test credentials passed to UPS auth client.
 */
const credentials = {
	clientId: "test",
	clientSecret: "test",
};

/**
 * Mock domain rate request.
 * Used across tests.
 */
const mockRequest = {
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

describe("RateService UPS integration", () => {
	beforeEach(() => {
		console.log("\n🔄 Resetting mocks");
		mockPost.mockReset();
	});

	test("returns normalized rate quotes", async () => {
		console.log("📦 Test: successful rate retrieval");

		mockPost
			.mockResolvedValueOnce(authSuccess)
			.mockResolvedValueOnce(rateSuccess);

		const service = new RateService({ ups: credentials }, mockHttp as any);

		const result = await service.getRates(mockRequest as any);

		console.log("✅ Received rates:", result);

		expect(result.length).toBe(1);
		expect(result[0]?.carrier).toBe("ups");
		expect(result[0]?.serviceCode).toBe("03");
		expect(result[0]?.totalCharge.amount).toBe(10.5);
	});

	test("reuses cached auth token", async () => {
		console.log("🔐 Test: token reuse behavior");

		mockPost
			.mockResolvedValueOnce(authSuccess)
			.mockResolvedValue(rateSuccess);

		const service = new RateService({ ups: credentials }, mockHttp as any);

		await service.getRates(mockRequest as any);
		await service.getRates(mockRequest as any);

		console.log("📡 HTTP calls made:", mockPost.mock.calls.length);

		/**
		 * Expected:
		 * 1 auth call
		 * 2 rate calls
		 */
		expect(mockPost.mock.calls.length).toBe(3);
	});

	test("fails when auth fails", async () => {
		console.log("🚫 Test: auth failure propagation");

		mockPost.mockRejectedValueOnce(new Error("auth failed"));

		const service = new RateService({ ups: credentials }, mockHttp as any);

		await expect(service.getRates(mockRequest as any)).rejects.toThrow();
	});

	test("fails on malformed UPS response", async () => {
		console.log("⚠️ Test: malformed UPS response");

		mockPost
			.mockResolvedValueOnce(authSuccess)
			.mockResolvedValueOnce(rateMalformed);

		const service = new RateService({ ups: credentials }, mockHttp as any);

		await expect(service.getRates(mockRequest as any)).rejects.toThrow();
	});

	test("propagates rate API/server errors", async () => {
		console.log("🔥 Test: server error propagation");

		mockPost
			.mockResolvedValueOnce(authSuccess)
			.mockRejectedValueOnce(new Error("Server error"));

		const service = new RateService({ ups: credentials }, mockHttp as any);

		await expect(service.getRates(mockRequest as any)).rejects.toThrow(
			"Server error",
		);
	});

	test("builds UPS request payload correctly", async () => {
		console.log("🧭 Test: UPS payload construction");

		mockPost
			.mockResolvedValueOnce(authSuccess)
			.mockResolvedValueOnce(rateSuccess);

		const service = new RateService({ ups: credentials }, mockHttp as any);

		await service.getRates(mockRequest as any);

		/**
		 * Find the call that contains UPS RateRequest payload.
		 */
		const rateCall = mockPost.mock.calls.find((call) => {
			const body = call[0]?.body;
			return body?.RateRequest !== undefined;
		});

		expect(rateCall).toBeDefined();

		const payload = rateCall![0].body;

		console.log("📨 Built UPS payload:", JSON.stringify(payload, null, 2));

		expect(payload.RateRequest).toBeDefined();
		expect(payload.RateRequest.Shipment.Package.length).toBe(1);
	});
});
