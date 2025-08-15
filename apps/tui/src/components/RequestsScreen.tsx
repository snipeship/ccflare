import * as tuiCore from "@ccflare/tui-core";
import { formatCost, formatTokens } from "@ccflare/ui-common";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { TokenUsageDisplay } from "./TokenUsageDisplay";

interface RequestsScreenProps {
	onBack: () => void;
}

export function RequestsScreen({ onBack }: RequestsScreenProps) {
	const [requests, setRequests] = useState<tuiCore.RequestPayload[]>([]);
	const [summaries, setSummaries] = useState<
		Map<string, tuiCore.RequestSummary>
	>(new Map());
	const [loading, setLoading] = useState(true);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [viewDetails, setViewDetails] = useState(false);
	const [page, setPage] = useState(0);
	const pageSize = 10;

	useInput((input, key) => {
		if (key.escape || input === "q") {
			if (viewDetails) {
				setViewDetails(false);
			} else {
				onBack();
			}
		}

		if (!viewDetails) {
			if (key.upArrow) {
				setSelectedIndex((prev) => Math.max(0, prev - 1));
			}
			if (key.downArrow) {
				setSelectedIndex((prev) =>
					Math.min(
						Math.min(requests.length - 1, page * pageSize + pageSize - 1),
						prev + 1,
					),
				);
			}
			if (key.leftArrow && page > 0) {
				setPage(page - 1);
				setSelectedIndex(page * pageSize - pageSize);
			}
			if (key.rightArrow && (page + 1) * pageSize < requests.length) {
				setPage(page + 1);
				setSelectedIndex(page * pageSize + pageSize);
			}
			if (key.return || input === " ") {
				if (requests.length > 0) {
					setViewDetails(true);
				}
			}
			if (input === "r") {
				loadRequests();
			}
		}
	});

	const loadRequests = useCallback(async () => {
		try {
			const [requestData, summaryData] = await Promise.all([
				tuiCore.getRequests(100),
				tuiCore.getRequestSummaries(100),
			]);
			setRequests(requestData);
			setSummaries(summaryData);
			setLoading(false);
		} catch (_error) {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadRequests();
		const interval = setInterval(loadRequests, 10000); // Auto-refresh every 10 seconds
		return () => clearInterval(interval);
	}, [loadRequests]);

	// For TUI, we want to show just time not full timestamp for space reasons
	const formatTime = (ts: number): string => {
		return new Date(ts).toLocaleTimeString();
	};

	const decodeBase64 = (str: string | null): string => {
		if (!str) return "No data";
		try {
			if (str === "[streamed]") {
				return "[Streaming data not captured]";
			}
			return Buffer.from(str, "base64").toString();
		} catch {
			return "Failed to decode";
		}
	};

	const formatJson = (str: string): string => {
		try {
			const parsed = JSON.parse(str);
			return JSON.stringify(parsed, null, 2);
		} catch {
			// If it's not valid JSON, return as-is
			return str;
		}
	};

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					📜 Request History
				</Text>
				<Text dimColor>Loading...</Text>
			</Box>
		);
	}

	const selectedRequest = requests[selectedIndex];
	const selectedSummary = selectedRequest
		? summaries.get(selectedRequest.id)
		: undefined;

	if (viewDetails && selectedRequest) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text color="cyan" bold>
						📜 Request Details
					</Text>
				</Box>

				<Box flexDirection="column">
					<Text bold>ID: {selectedRequest.id}</Text>
					<Text bold>Time: {formatTime(selectedRequest.meta.timestamp)}</Text>

					{selectedRequest.meta.accountName && (
						<Text>Account: {selectedRequest.meta.accountName}</Text>
					)}

					{selectedSummary?.clientIp && (
						<Text>Client IP: {selectedSummary.clientIp}</Text>
					)}

					{selectedSummary?.model && (
						<Text>
							Model: <Text color="green">{selectedSummary.model}</Text>
						</Text>
					)}

					{selectedSummary?.responseTimeMs && (
						<Text>
							Response Time:{" "}
							<Text color="yellow">{selectedSummary.responseTimeMs}ms</Text>
						</Text>
					)}

					{selectedRequest.meta.retry !== undefined &&
						selectedRequest.meta.retry > 0 && (
							<Text color="yellow">Retry: {selectedRequest.meta.retry}</Text>
						)}

					{selectedRequest.meta.rateLimited && (
						<Text color="orange">Rate Limited</Text>
					)}

					{selectedRequest.error && (
						<Text color="red">Error: {selectedRequest.error}</Text>
					)}

					{/* Token Usage Section */}
					{selectedSummary &&
						(selectedSummary.inputTokens || selectedSummary.outputTokens) && (
							<Box marginTop={1}>
								<TokenUsageDisplay summary={selectedSummary} />
							</Box>
						)}

					<Box marginTop={1}>
						<Text bold>Request Headers:</Text>
						<Box marginLeft={2} flexDirection="column">
							<Text dimColor>
								{formatJson(JSON.stringify(selectedRequest.request.headers))}
							</Text>
						</Box>
					</Box>

					{selectedRequest.request.body && (
						<Box marginTop={1}>
							<Text bold>Request Body:</Text>
							<Box marginLeft={2}>
								<Text dimColor>
									{formatJson(
										decodeBase64(selectedRequest.request.body),
									).substring(0, 500)}
									{decodeBase64(selectedRequest.request.body).length > 500 &&
										"..."}
								</Text>
							</Box>
						</Box>
					)}

					{selectedRequest.response && (
						<>
							<Box marginTop={1}>
								<Text bold>
									Response Status:{" "}
									<Text
										color={
											selectedRequest.response.status >= 200 &&
											selectedRequest.response.status < 300
												? "green"
												: selectedRequest.response.status >= 400 &&
														selectedRequest.response.status < 500
													? "yellow"
													: "red"
										}
									>
										{selectedRequest.response.status}
									</Text>
								</Text>
							</Box>

							{selectedRequest.response.body && (
								<Box marginTop={1}>
									<Text bold>Response Body:</Text>
									<Box marginLeft={2}>
										<Text dimColor>
											{formatJson(
												decodeBase64(selectedRequest.response.body),
											).substring(0, 500)}
											{decodeBase64(selectedRequest.response.body).length >
												500 && "..."}
										</Text>
									</Box>
								</Box>
							)}
						</>
					)}
				</Box>

				<Box marginTop={2}>
					<Text dimColor>Press 'q' or ESC to go back</Text>
				</Box>
			</Box>
		);
	}

	// Paginated view
	const startIdx = page * pageSize;
	const endIdx = Math.min(startIdx + pageSize, requests.length);
	const pageRequests = requests.slice(startIdx, endIdx);
	const totalPages = Math.ceil(requests.length / pageSize);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					📜 Request History
				</Text>
				<Text dimColor>
					Use ↑/↓ to navigate, ←/→ for pages, ENTER to view details
				</Text>
			</Box>

			{requests.length === 0 ? (
				<Text dimColor>No requests found</Text>
			) : (
				<Box flexDirection="column">
					{pageRequests.map((req, idx) => {
						const index = startIdx + idx;
						const isSelected = index === selectedIndex;
						const isError = req.error || !req.meta.success;
						const statusCode = req.response?.status;
						const summary = summaries.get(req.id);

						return (
							<Box key={req.id}>
								<Text
									color={isSelected ? "cyan" : undefined}
									inverse={isSelected}
								>
									{isSelected ? "▶ " : "  "}
									{formatTime(req.meta.timestamp)} -{" "}
									{statusCode ? (
										<Text
											color={
												statusCode >= 200 && statusCode < 300
													? "green"
													: statusCode >= 400 && statusCode < 500
														? "yellow"
														: "red"
											}
										>
											{statusCode}
										</Text>
									) : (
										<Text color="red">ERROR</Text>
									)}
									{" - "}
									{req.meta.accountName ||
										req.meta.accountId?.slice(0, 8) ||
										"No Account"}
									{summary?.model && (
										<>
											{" - "}
											<Text color="magenta">
												{summary.model.split("-").pop()}
											</Text>
										</>
									)}
									{summary?.totalTokens && (
										<>
											{" - "}
											<Text dimColor>
												{formatTokens(summary.totalTokens)} tokens
											</Text>
										</>
									)}
									{summary?.costUsd && summary.costUsd > 0 && (
										<>
											{" - "}
											<Text color="green">{formatCost(summary.costUsd)}</Text>
										</>
									)}
									{req.meta.rateLimited && (
										<Text color="orange"> [RATE LIMITED]</Text>
									)}
									{isError &&
										req.error &&
										` - ${req.error.substring(0, 20)}...`}
								</Text>
							</Box>
						);
					})}

					<Box marginTop={1}>
						<Text dimColor>
							Page {page + 1}/{totalPages} • {requests.length} total requests
						</Text>
					</Box>
				</Box>
			)}

			<Box marginTop={2}>
				<Text dimColor>Press 'r' to refresh • 'q' or ESC to go back</Text>
			</Box>
		</Box>
	);
}
