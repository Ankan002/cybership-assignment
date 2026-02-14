import type { RateQuote, RateRequest } from "@/models/rate";

export interface CarrierInterface {
	getRates(request: RateRequest): Promise<RateQuote>;
}
