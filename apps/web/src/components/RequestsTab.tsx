import { formatCost } from "@ccflare/core";
import type { RequestPayload } from "@ccflare/types";
import {
	decodeBase64Body,
	formatDuration,
	formatTokens,
	formatTokensPerSecond,
} from "@ccflare/ui";
import {
	Calendar,
	ChevronDown,
	ChevronRight,
	Clock,
	Eye,
	Filter,
	Hash,
	RefreshCw,
	User,
	X,
} from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { useRequestsPageModel } from "../hooks/useRequestsPageModel";
import type { RequestListItem } from "../lib/request-list-model";
import { getStatusCodeTextClass } from "../lib/request-status";
import { CopyButton } from "./CopyButton";
import { RequestDetailsModal } from "./RequestDetailsModal";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

export function RequestsTab() {
	const [expandedRequests, setExpandedRequests] = useState<Set<string>>(
		new Set(),
	);
	const [modalItem, setModalItem] = useState<RequestListItem | null>(null);
	const [showFilters, setShowFilters] = useState(false);

	const {
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
		hasActiveFilters,
		loading,
		error,
		refetch: loadRequests,
	} = useRequestsPageModel(200);

	const toggleExpanded = (id: string) => {
		setExpandedRequests((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const getStatusCodeColor = (code: number) => {
		return getStatusCodeTextClass(code);
	};

	/**
	 * Copy the given request to the clipboard as pretty-printed JSON, with
	 * any base64-encoded bodies already decoded for easier debugging.
	 */
	// copyRequest helper removed – handled inline by CopyButton

	if (loading) {
		return (
			<Card>
				<CardContent className="pt-6">
					<p className="text-muted-foreground">Loading requests...</p>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent className="pt-6">
					<p className="text-destructive">
						Error: {error instanceof Error ? error.message : String(error)}
					</p>
					<Button
						onClick={() => loadRequests()}
						variant="outline"
						size="sm"
						className="mt-2"
					>
						<RefreshCw className="mr-2 h-4 w-4" />
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Request History</CardTitle>
						<CardDescription>
							Detailed request and response data (last 200)
						</CardDescription>
					</div>
					<div className="flex gap-2">
						<Button
							onClick={() => setShowFilters(!showFilters)}
							variant={showFilters ? "default" : "outline"}
							size="sm"
							className="relative"
						>
							<Filter className="h-4 w-4 mr-2" />
							Filters
							{hasActiveFilters && !showFilters && (
								<span className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full animate-pulse" />
							)}
						</Button>
						<Button onClick={() => loadRequests()} variant="ghost" size="icon">
							<RefreshCw className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{/* Active Filters Display */}
				{hasActiveFilters && (
					<div className="mb-4 p-3 bg-muted/50 rounded-lg">
						<div className="flex flex-wrap items-center gap-2">
							{accountFilter !== "all" && (
								<Badge variant="outline" className="gap-1.5 pr-1">
									<User className="h-3 w-3" />
									{accountFilter}
									<button
										type="button"
										onClick={() => setAccountFilter("all")}
										className="ml-1 p-0.5 hover:bg-destructive/20 rounded"
									>
										<X className="h-3 w-3" />
									</button>
								</Badge>
							)}
							{statusCodeFilters.size > 0 && (
								<Badge variant="outline" className="gap-1.5 pr-1">
									<Hash className="h-3 w-3" />
									{Array.from(statusCodeFilters).join(", ")}
									<button
										type="button"
										onClick={() => {
											for (const code of Array.from(statusCodeFilters)) {
												toggleStatusCode(code);
											}
										}}
										className="ml-1 p-0.5 hover:bg-destructive/20 rounded"
									>
										<X className="h-3 w-3" />
									</button>
								</Badge>
							)}
							{(dateFrom || dateTo) && (
								<Badge variant="outline" className="gap-1.5 pr-1">
									<Calendar className="h-3 w-3" />
									{dateFrom && dateTo
										? "Custom range"
										: dateFrom
											? `From ${new Date(dateFrom).toLocaleDateString()}`
											: `Until ${new Date(dateTo).toLocaleDateString()}`}
									<button
										type="button"
										onClick={() => {
											setDateFrom("");
											setDateTo("");
										}}
										className="ml-1 p-0.5 hover:bg-destructive/20 rounded"
									>
										<X className="h-3 w-3" />
									</button>
								</Badge>
							)}
							<div className="ml-auto flex items-center gap-2">
								<span className="text-xs text-muted-foreground">
									{requests.length} of {allRequests.length} requests
								</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={clearFilters}
									className="h-7 text-xs"
								>
									Clear all
								</Button>
							</div>
						</div>
					</div>
				)}

				{/* Filters Panel */}
				{showFilters && (
					<div className="mb-6 border rounded-lg bg-card">
						<div className="p-4 border-b">
							<div className="flex items-center justify-between">
								<h3 className="font-medium">Filters</h3>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setShowFilters(false)}
									className="h-8 w-8 p-0"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						</div>

						<div className="p-4 space-y-4">
							{/* Time Range Section */}
							<div>
								<h4 className="text-sm font-medium mb-3 flex items-center gap-2">
									<Clock className="h-4 w-4" />
									Time Range
								</h4>
								<div className="flex flex-wrap gap-2 mb-3">
									<Button
										variant={dateFrom || dateTo ? "outline" : "secondary"}
										size="sm"
										onClick={() => applyDatePreset("1h")}
									>
										Last hour
									</Button>
									<Button
										variant={dateFrom || dateTo ? "outline" : "secondary"}
										size="sm"
										onClick={() => applyDatePreset("24h")}
									>
										Last 24h
									</Button>
									<Button
										variant={dateFrom || dateTo ? "outline" : "secondary"}
										size="sm"
										onClick={() => applyDatePreset("7d")}
									>
										Last 7 days
									</Button>
									<Button
										variant={dateFrom || dateTo ? "outline" : "secondary"}
										size="sm"
										onClick={() => applyDatePreset("30d")}
									>
										Last 30 days
									</Button>
								</div>
								<div className="grid grid-cols-2 gap-3">
									<div>
										<Label htmlFor="date-from" className="text-xs">
											From
										</Label>
										<Input
											id="date-from"
											type="datetime-local"
											value={dateFrom}
											onChange={(e) => setDateFrom(e.target.value)}
											className="h-9 text-sm"
										/>
									</div>
									<div>
										<Label htmlFor="date-to" className="text-xs">
											To
										</Label>
										<Input
											id="date-to"
											type="datetime-local"
											value={dateTo}
											onChange={(e) => setDateTo(e.target.value)}
											className="h-9 text-sm"
										/>
									</div>
								</div>
							</div>

							<div className="h-px bg-border" />

							{/* Resource Filters */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								{/* Account Filter */}
								<div>
									<Label className="text-xs flex items-center gap-1 mb-2">
										<User className="h-3 w-3" />
										Account
									</Label>
									<Select
										value={accountFilter}
										onValueChange={setAccountFilter}
									>
										<SelectTrigger className="h-9">
											<SelectValue placeholder="All accounts" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All accounts</SelectItem>
											{uniqueAccounts.map((account) => (
												<SelectItem key={account} value={account || ""}>
													{account}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Status Code Filter */}
								<div>
									<Label className="text-xs flex items-center gap-1 mb-2">
										<Hash className="h-3 w-3" />
										Status Code
									</Label>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="outline"
												className="h-9 w-full justify-between font-normal"
											>
												{statusCodeFilters.size > 0
													? `${statusCodeFilters.size} selected`
													: "All codes"}
												<ChevronDown className="h-4 w-4 opacity-50" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
											<div className="p-2">
												<div className="text-xs font-medium text-muted-foreground mb-2">
													Select status codes
												</div>
												{uniqueStatusCodes.map((code) => (
													<button
														key={code}
														type="button"
														className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer w-full text-left"
														onClick={() => toggleStatusCode(code.toString())}
													>
														<div
															className={`w-4 h-4 border rounded-sm flex items-center justify-center ${
																statusCodeFilters.has(code.toString())
																	? "bg-primary border-primary"
																	: "border-input"
															}`}
														>
															{statusCodeFilters.has(code.toString()) && (
																<svg
																	className="w-3 h-3 text-primary-foreground"
																	fill="none"
																	viewBox="0 0 24 24"
																	stroke="currentColor"
																	aria-label="Selected"
																>
																	<title>Selected</title>
																	<path
																		strokeLinecap="round"
																		strokeLinejoin="round"
																		strokeWidth={3}
																		d="M5 13l4 4L19 7"
																	/>
																</svg>
															)}
														</div>
														<span
															className={`text-sm font-medium ${getStatusCodeColor(code)}`}
														>
															{code}
														</span>
													</button>
												))}
											</div>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						</div>
					</div>
				)}

				{allRequests.length === 0 && !loading ? (
					<p className="text-muted-foreground">No requests found</p>
				) : requests.length === 0 ? (
					<p className="text-muted-foreground">
						No requests match the selected filters
					</p>
				) : (
					<div className="space-y-2">
						{requests.map((request) => {
							const isExpanded = expandedRequests.has(request.id);
							const isError =
								!request.pending &&
								(Boolean(request.summary?.errorMessage) ||
									request.summary?.success === false);
							const statusCode = request.statusCode;
							const summary = request.summary ?? undefined;

							return (
								<div
									key={request.id}
									className={`border rounded-lg p-3 transition-all duration-300 ${
										isError ? "border-destructive/50" : "border-border"
									} ${
										request.pending ? "animate-pulse opacity-70" : "opacity-100"
									}`}
								>
									<button
										type="button"
										className="flex items-center justify-between cursor-pointer w-full text-left"
										onClick={() => toggleExpanded(request.id)}
									>
										<div className="flex items-center gap-2 flex-wrap">
											{isExpanded ? (
												<ChevronDown className="h-4 w-4" />
											) : (
												<ChevronRight className="h-4 w-4" />
											)}
											<span className="text-sm font-mono">
												{new Date(request.timestamp).toLocaleTimeString()}
											</span>
											{request.method && (
												<span className="text-sm font-medium">
													{request.method}
												</span>
											)}
											{request.path && (
												<span className="text-sm text-muted-foreground font-mono">
													{request.path}
												</span>
											)}
											{statusCode && (
												<span
													className={`text-sm font-medium ${getStatusCodeTextClass(
														statusCode,
													)}`}
												>
													{statusCode}
												</span>
											)}
											{summary?.model && (
												<Badge variant="secondary" className="text-xs">
													{summary.model}
												</Badge>
											)}
											{(summary?.totalTokens || request.pending) && (
												<Badge variant="outline" className="text-xs">
													{summary?.totalTokens
														? formatTokens(summary.totalTokens)
														: "--"}{" "}
													tokens
												</Badge>
											)}
											{(summary?.costUsd || request.pending) && (
												<Badge variant="default" className="text-xs">
													{summary?.costUsd && summary.costUsd > 0
														? formatCost(summary.costUsd)
														: "--"}
												</Badge>
											)}
											{summary?.tokensPerSecond &&
												summary.tokensPerSecond > 0 && (
													<Badge variant="secondary" className="text-xs">
														{formatTokensPerSecond(summary.tokensPerSecond)}
													</Badge>
												)}
											{(request.accountName || request.accountId) && (
												<span className="text-sm text-muted-foreground">
													via{" "}
													{request.accountName ||
														`${request.accountId?.slice(0, 8)}...`}
												</span>
											)}
											{statusCode === 429 && (
												<Badge variant="warning" className="text-xs">
													Rate Limited
												</Badge>
											)}
											{request.summary?.errorMessage && (
												<span className="text-sm text-destructive">
													Error: {request.summary.errorMessage}
												</span>
											)}
										</div>
										<div className="text-sm text-muted-foreground flex items-center gap-2">
											{(summary?.responseTimeMs || request.pending) && (
												<span>
													{summary?.responseTimeMs
														? formatDuration(summary.responseTimeMs)
														: "--"}
												</span>
											)}
											{summary?.failoverAttempts !== undefined &&
												summary.failoverAttempts > 0 && (
													<span>Retry {summary.failoverAttempts}</span>
												)}
											<span>ID: {request.id.slice(0, 8)}...</span>
										</div>
									</button>

									{/* Action buttons */}
									<div className="flex justify-end gap-2 mt-2">
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setModalItem(request)}
											title="View Details"
										>
											<Eye className="h-4 w-4" />
										</Button>
										<CopyButton
											variant="ghost"
											size="icon"
											title="Copy as JSON"
											getValue={async () => {
												const detail = await api.getRequestDetail(request.id);
												const decoded: RequestPayload & { decoded?: true } = {
													...detail,
													request: {
														...detail.request,
														body: detail.request.body
															? decodeBase64Body(detail.request.body)
															: null,
													},
													response: detail.response
														? {
																...detail.response,
																body: detail.response.body
																	? decodeBase64Body(detail.response.body)
																	: null,
															}
														: null,
													decoded: true,
												};
												return JSON.stringify(decoded, null, 2);
											}}
										/>
									</div>

									{isExpanded && (
										<div className="mt-3 space-y-3">
											<TokenUsageDisplay summary={summary} />
											<Button
												variant="outline"
												size="sm"
												onClick={() => setModalItem(request)}
												className="w-full"
											>
												<Eye className="h-4 w-4 mr-2" />
												View More Details
											</Button>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</CardContent>

			{modalItem && (
				<RequestDetailsModal
					item={modalItem}
					isOpen={true}
					onClose={() => setModalItem(null)}
				/>
			)}
		</Card>
	);
}
