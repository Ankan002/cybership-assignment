export class CarrierError extends Error {
	code: string;
	retryable: boolean;

	constructor(message: string, code: string, retryable: boolean = false) {
		super(message);
		this.code = code;
		this.retryable = retryable;
	}
}
