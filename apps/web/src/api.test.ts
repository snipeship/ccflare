import { afterEach, describe, expect, it } from "bun:test";
import { api } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("request detail client", () => {
	it("fetches one exact encoded request id", async () => {
		const urls: string[] = [];
		globalThis.fetch = Object.assign(
			async (input: RequestInfo | URL) => {
				urls.push(String(input));
				return new Response(
					JSON.stringify({
						id: "id/with space",
						request: { headers: {}, body: null },
						response: null,
						meta: {
							trace: { timestamp: 1 },
							account: { id: null },
							transport: { pending: true },
						},
					}),
					{ headers: { "content-type": "application/json" } },
				);
			},
			{ preconnect: originalFetch.preconnect },
		) as typeof fetch;

		const detail = await api.getRequestDetail("id/with space");

		expect(detail.id).toBe("id/with space");
		expect(urls).toEqual(["/api/requests/id%2Fwith%20space/detail"]);
	});
});
