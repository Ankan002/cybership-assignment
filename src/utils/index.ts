import { HttpClient } from "./http.client";

export const utilsRegistry = {
	httpClient: new HttpClient(),
};

Object.freeze(utilsRegistry);
