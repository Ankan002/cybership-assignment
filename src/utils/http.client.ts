interface PostOptions<
	T extends Record<string, unknown> = Record<string, unknown>,
> {
	url: string;
	body?: T;
	options?: {
		headers?: Record<string, string>;
	};
}

export class HttpClient {
	async post<T extends Record<string, unknown>, ResponseBody>(
		options: PostOptions<T>,
	): Promise<ResponseBody> {
		const res = await fetch(options.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(options.options?.headers ?? {}),
			},
			body: JSON.stringify(options.body),
		});

		if (!res.ok) {
			throw new Error(`HTTP Error ${res.status}`);
		}

		return res.json() as Promise<ResponseBody>;
	}
}
