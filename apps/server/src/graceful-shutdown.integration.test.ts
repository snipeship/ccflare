import { describe, expect, it } from "bun:test";
import { REPO_ROOT } from "./test-helpers/workspace";

// REPO_ROOT was previously hardcoded to the original author's local machine path
// ("/Users/brain/Coding/snipeship/ccflare"), which does not exist on any other checkout and made
// this test non-portable (Bun.spawn's cwd pointing at a nonexistent directory fails with a
// misleading ENOENT attributed to the spawned binary, not the cwd). Reusing the existing portable
// helper (computed via import.meta.dir, not hardcoded) fixes this for any checkout location.

describe("graceful shutdown integration", () => {
	it("awaits programmatic stop until pending request writes are flushed", async () => {
		const script = `
			import { mkdtempSync, rmSync } from "node:fs";
			import { tmpdir } from "node:os";
			import { join } from "node:path";
			import startServer from "./apps/server/src/server.ts";

			const SERVER_URL = "http://localhost:8080";
			const originalFetch = globalThis.fetch;
			const tempDir = mkdtempSync(join(tmpdir(), "ccflare-shutdown-"));
			process.env.ccflare_DB_PATH = join(tempDir, "ccflare.db");
			process.env.ccflare_CONFIG_PATH = join(tempDir, "ccflare.json");

			async function waitFor(run, isReady, timeoutMs = 4000) {
				const deadline = Date.now() + timeoutMs;
				while (Date.now() < deadline) {
					const value = await run();
					if (isReady(value)) {
						return value;
					}
					await Bun.sleep(25);
				}
				throw new Error("Timed out waiting for condition");
			}

			try {
				globalThis.fetch = Object.assign(
					async (input, init) => {
						const request = new Request(input, init);
						const url = new URL(request.url);

						if (url.origin === "https://api.openai.com") {
							return new Response(
								JSON.stringify({
									id: "resp_shutdown_test",
									model: "gpt-4o-mini",
									usage: {
										input_tokens: 3,
										output_tokens: 2,
										total_tokens: 5,
									},
									output: [
										{
											type: "message",
											content: [{ type: "output_text", text: "ok" }],
										},
									],
								}),
								{
									status: 200,
									headers: {
										"content-type": "application/json",
									},
								},
							);
						}

						return originalFetch(input, init);
					},
					{ preconnect: originalFetch.preconnect },
				);

				let server = startServer({ port: 8080, withDashboard: false });

				await waitFor(
					async () => (await originalFetch(\`\${SERVER_URL}/health\`)).status,
					(status) => status === 200,
				);

				const createAccountResponse = await originalFetch(\`\${SERVER_URL}/api/accounts\`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						name: "shutdown-openai",
						provider: "openai",
						auth_method: "api_key",
						api_key: "sk-openai-test",
					}),
				});
				if (createAccountResponse.status !== 200) {
					throw new Error(\`Account creation failed: \${createAccountResponse.status}\`);
				}

				const proxyResponse = await originalFetch(\`\${SERVER_URL}/v1/openai/responses\`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						model: "gpt-4o-mini",
						input: "flush writes on shutdown",
					}),
				});
				if (proxyResponse.status !== 200) {
					throw new Error(\`Proxy request failed: \${proxyResponse.status}\`);
				}

				// Give background tasks a moment to post worker messages
				await Bun.sleep(200);
				await server.stop();
				server = startServer({ port: 8080, withDashboard: false });
				await waitFor(
					async () => (await originalFetch(\`\${SERVER_URL}/health\`)).status,
					(status) => status === 200,
				);

				const requests = await waitFor(
					async () => {
						const response = await originalFetch(\`\${SERVER_URL}/api/requests?limit=5\`);
						if (!response.ok) {
							throw new Error(\`Requests fetch failed: \${response.status}\`);
						}
						const data = await response.json();
						return data;
					},
					(entries) =>
						Array.isArray(entries) &&
						entries.some(
							(entry) =>
								entry.path === "/v1/openai/responses" &&
								entry.totalTokens === 5 &&
								entry.success === true,
						),
				);

				await server.stop();
				console.log(JSON.stringify({
					request: requests.find((entry) => entry.path === "/v1/openai/responses"),
				}));
			} finally {
				globalThis.fetch = originalFetch;
				rmSync(tempDir, { force: true, recursive: true });
			}
		`;

		const subprocess = Bun.spawn(["bun", "-e", script], {
			cwd: REPO_ROOT,
			stdout: "pipe",
			stderr: "pipe",
			env: process.env,
		});

		const [exitCode, stdout] = await Promise.all([
			subprocess.exited,
			new Response(subprocess.stdout).text(),
		]);

		expect(exitCode).toBe(0);

		const resultLine = stdout
			.trim()
			.split("\n")
			.filter((line) => line.startsWith("{"))
			.at(-1);
		expect(resultLine).toBeDefined();

		const result = JSON.parse(resultLine as string) as {
			request: {
				path: string;
				provider: string;
				model: string;
				inputTokens: number;
				outputTokens: number;
				totalTokens: number;
				success: boolean;
			};
		};

		expect(result.request).toMatchObject({
			path: "/v1/openai/responses",
			provider: "openai",
			model: "gpt-4o-mini",
			inputTokens: 3,
			outputTokens: 2,
			totalTokens: 5,
			success: true,
		});
	});
});
