import type { AccountResponse } from "@ccflare/api";
import { parseRequestStreamEvent } from "@ccflare/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api";
import { REFRESH_INTERVALS } from "../constants";
import { queryKeys } from "../lib/query-keys";
import {
	applyRequestStreamEvent,
	filterRequestList,
	type RequestListItem,
	reconcileRequestList,
} from "../lib/request-list-model";

/** Metadata-only page model for request history. Full payloads are fetched on demand. */
export function useRequestsPageModel(limit = 200) {
	const queryClient = useQueryClient();
	const [accountFilter, setAccountFilter] = useState<string>("all");
	const [dateFrom, setDateFrom] = useState<string>("");
	const [dateTo, setDateTo] = useState<string>("");
	const [statusCodeFilters, setStatusCodeFilters] = useState<Set<string>>(
		new Set(),
	);

	const {
		data,
		isLoading: loading,
		error,
		refetch,
	} = useQuery<RequestListItem[]>({
		queryKey: queryKeys.requests(limit),
		queryFn: async () => {
			const summaries = await api.getRequestsSummary(limit);
			const current = queryClient.getQueryData<RequestListItem[]>(
				queryKeys.requests(limit),
			);
			return reconcileRequestList(summaries, current, limit);
		},
		refetchInterval: REFRESH_INTERVALS.fast,
	});

	useEffect(() => {
		let es: EventSource | null = null;
		let isDisposed = false;
		let retries = 0;
		let reconnectTimeout: NodeJS.Timeout | null = null;

		const connect = () => {
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}

			es = new EventSource("/api/requests/stream");
			es.addEventListener("open", () => {
				retries = 0;
			});
			es.addEventListener("message", (ev) => {
				const event = parseRequestStreamEvent(JSON.parse(ev.data));
				if (!event) return;

				queryClient.setQueryData<RequestListItem[]>(
					queryKeys.requests(limit),
					(current) => {
						if (!current) return current;
						let accountName: string | null = null;
						if (event.type === "start") {
							const accounts = queryClient.getQueryData<AccountResponse[]>(
								queryKeys.accounts(),
							);
							accountName =
								accounts?.find((account) => account.id === event.accountId)
									?.name ?? null;
						}
						return applyRequestStreamEvent(current, event, limit, accountName);
					},
				);
			});
			es.addEventListener("error", () => {
				if (isDisposed) return;
				es?.close();
				es = null;
				const delay = Math.min(1000 * 2 ** retries, 30000);
				retries++;
				reconnectTimeout = setTimeout(connect, delay);
			});
		};

		connect();
		return () => {
			isDisposed = true;
			if (reconnectTimeout) clearTimeout(reconnectTimeout);
			es?.close();
		};
	}, [limit, queryClient]);

	const allRequests = data ?? [];
	const uniqueAccounts = Array.from(
		new Set(
			allRequests
				.map((request) => request.accountName || request.accountId || null)
				.filter(Boolean),
		),
	).sort();
	const uniqueStatusCodes = Array.from(
		new Set(
			allRequests
				.map((request) => request.statusCode)
				.filter((status): status is number => status !== null),
		),
	).sort((left, right) => left - right);
	const requests = filterRequestList(allRequests, {
		account: accountFilter,
		dateFrom,
		dateTo,
		statusCodes: statusCodeFilters,
	});

	function applyDatePreset(preset: "1h" | "24h" | "7d" | "30d") {
		const now = new Date();
		const hours = { "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 }[preset];
		setDateFrom(
			new Date(now.getTime() - hours * 60 * 60 * 1000)
				.toISOString()
				.slice(0, 16),
		);
		setDateTo(now.toISOString().slice(0, 16));
	}

	function toggleStatusCode(code: string) {
		setStatusCodeFilters((previous) => {
			const next = new Set(previous);
			next.has(code) ? next.delete(code) : next.add(code);
			return next;
		});
	}

	function clearFilters() {
		setAccountFilter("all");
		setDateFrom("");
		setDateTo("");
		setStatusCodeFilters(new Set());
	}

	return {
		requests,
		allRequests,
		accountFilter,
		setAccountFilter,
		dateFrom,
		setDateFrom,
		dateTo,
		setDateTo,
		statusCodeFilters,
		toggleStatusCode,
		clearFilters,
		applyDatePreset,
		uniqueAccounts,
		uniqueStatusCodes,
		hasActiveFilters:
			accountFilter !== "all" ||
			dateFrom !== "" ||
			dateTo !== "" ||
			statusCodeFilters.size > 0,
		loading,
		error,
		refetch,
	};
}
