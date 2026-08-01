import type {
	HttpMethod,
	RequestStreamEvent,
	RequestSummary,
} from "@ccflare/types";

/** Metadata retained by the request-history list. Payload headers and bodies never enter this model. */
export interface RequestListItem {
	id: string;
	timestamp: number;
	method: HttpMethod;
	path: string;
	accountId: string | null;
	accountName: string | null;
	statusCode: number | null;
	pending: boolean;
	summary: RequestSummary | null;
}

export interface RequestListFilters {
	account: string;
	dateFrom: string;
	dateTo: string;
	statusCodes: Set<string>;
}

export function requestListItemFromSummary(
	summary: RequestSummary,
): RequestListItem {
	return {
		id: summary.id,
		timestamp: Date.parse(summary.timestamp),
		method: summary.method,
		path: summary.path,
		accountId: summary.accountUsed,
		accountName: summary.accountName,
		statusCode: summary.statusCode,
		pending: summary.success === null,
		summary,
	};
}

export function reconcileRequestList(
	summaries: RequestSummary[],
	current: RequestListItem[] = [],
	limit: number,
): RequestListItem[] {
	const summaryIds = new Set(summaries.map((summary) => summary.id));
	const pending = current.filter(
		(item) => item.pending && !summaryIds.has(item.id),
	);
	return [...summaries.map(requestListItemFromSummary), ...pending]
		.sort((left, right) => right.timestamp - left.timestamp)
		.slice(0, limit);
}

export function applyRequestStreamEvent(
	items: RequestListItem[],
	event: RequestStreamEvent,
	limit: number,
	accountName: string | null = null,
): RequestListItem[] {
	if (event.type === "summary") {
		const completed = requestListItemFromSummary(event.payload);
		const existingIndex = items.findIndex((item) => item.id === completed.id);
		if (existingIndex < 0) return [completed, ...items].slice(0, limit);
		return items.map((item, index) =>
			index === existingIndex ? completed : item,
		);
	}

	const existing = items.find((item) => item.id === event.id);
	const item: RequestListItem = {
		id: event.id,
		timestamp: event.timestamp,
		method: event.method,
		path: event.path,
		accountId: event.type === "start" ? event.accountId : null,
		accountName: event.type === "start" ? accountName : null,
		statusCode: event.type === "start" ? event.statusCode : null,
		pending: true,
		summary: null,
	};

	if (!existing) return [item, ...items].slice(0, limit);
	if (event.type === "ingress") return items;
	return items.map((current) =>
		current.id === event.id ? { ...current, ...item } : current,
	);
}

export function filterRequestList(
	items: RequestListItem[],
	filters: RequestListFilters,
): RequestListItem[] {
	return items.filter((item) => {
		if (
			filters.account !== "all" &&
			(item.accountName || item.accountId) !== filters.account
		) {
			return false;
		}
		if (
			filters.statusCodes.size > 0 &&
			item.statusCode !== null &&
			!filters.statusCodes.has(item.statusCode.toString())
		) {
			return false;
		}

		const requestDate = new Date(item.timestamp);
		if (filters.dateFrom) {
			const fromDate = new Date(filters.dateFrom);
			fromDate.setHours(0, 0, 0, 0);
			if (requestDate < fromDate) return false;
		}
		if (filters.dateTo) {
			const toDate = new Date(filters.dateTo);
			toDate.setHours(23, 59, 59, 999);
			if (requestDate > toDate) return false;
		}
		return true;
	});
}
