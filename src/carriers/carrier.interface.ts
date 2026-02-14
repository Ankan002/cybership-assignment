import type { RateQuote, RateRequest } from "@/models/rate";

export interface Carrier {
	getRates(request: RateRequest): Promise<RateQuote[]>;
}
