export interface Address {
	name?: string;
	company?: string;

	addressLine1: string;
	addressLine2?: string;

	city: string;
	state?: string;
	postalCode: string;
	countryCode: string;

	phone?: string;
}
