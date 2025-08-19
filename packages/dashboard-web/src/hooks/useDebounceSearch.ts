import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchFilters, SearchResponse } from "../api";
import { api } from "../api";
import { queryKeys } from "../lib/query-keys";

/**
 * Custom hook for debounced search functionality
 */
export function useDebounceSearch(
	query: string,
	filters: SearchFilters = {},
	debounceMs: number = 300,
) {
	const [debouncedQuery, setDebouncedQuery] = useState(query);

	// Debounce the search query
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(query);
		}, debounceMs);

		return () => clearTimeout(timer);
	}, [query, debounceMs]);

	// Create a stable filters object for the query key
	const stableFilters = useMemo(() => filters, [filters]);

	// Search function using useQuery
	const searchQuery = useQuery({
		queryKey: queryKeys.search(debouncedQuery, stableFilters),
		queryFn: () => api.searchRequests(debouncedQuery, stableFilters),
		enabled: debouncedQuery.trim().length > 0, // Only search if query is not empty
		refetchOnWindowFocus: false,
		staleTime: 30000, // Consider data fresh for 30 seconds
	});

	// Manual search function for immediate search trigger
	const search = useCallback(
		(immediateQuery?: string, immediateFilters?: SearchFilters) => {
			const queryToUse = immediateQuery ?? debouncedQuery;
			const filtersToUse = immediateFilters ?? stableFilters;

			if (queryToUse.trim().length === 0) {
				return Promise.resolve({
					results: [],
					total: 0,
					query: queryToUse,
					filters: filtersToUse,
				} as SearchResponse);
			}

			return api.searchRequests(queryToUse, filtersToUse);
		},
		[debouncedQuery, stableFilters],
	);

	return {
		data: searchQuery.data,
		isLoading: searchQuery.isLoading,
		error: searchQuery.error,
		isError: searchQuery.isError,
		search,
		refetch: searchQuery.refetch,
		isSearching: debouncedQuery !== query || searchQuery.isFetching,
		hasSearched: debouncedQuery.trim().length > 0,
	};
}
