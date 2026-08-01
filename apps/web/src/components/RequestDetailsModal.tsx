import { formatCost } from "@ccflare/core";
import {
	decodeBase64Utf8,
	type RequestPayload,
	type RequestSummary,
} from "@ccflare/types";
import {
	formatBody as formatBodyBase,
	formatHeaders as formatHeadersBase,
	formatTimestamp,
	formatTokens,
} from "@ccflare/ui";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { queryKeys } from "../lib/query-keys";
import type { RequestListItem } from "../lib/request-list-model";
import { getStatusCodeBadgeVariant } from "../lib/request-status";
import { ConversationView } from "./ConversationView";
import { CopyButton } from "./CopyButton";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import { Badge } from "./ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface RequestDetailsModalProps {
	item: RequestListItem;
	isOpen: boolean;
	onClose: () => void;
}

export function RequestDetailsModal({
	item,
	isOpen,
	onClose,
}: RequestDetailsModalProps) {
	const [beautifyMode, setBeautifyMode] = useState(true);
	const summary: RequestSummary | undefined = item.summary ?? undefined;
	const {
		data: request,
		isLoading: detailLoading,
		error: detailError,
	} = useQuery<RequestPayload>({
		queryKey: queryKeys.requestDetail(item.id),
		queryFn: () => api.getRequestDetail(item.id),
		enabled: isOpen,
	});
	const {
		data: conversationChain = [],
		isLoading: conversationLoading,
		error: conversationError,
	} = useQuery({
		queryKey: queryKeys.requestConversation(item.id),
		queryFn: () => api.getRequestConversation(item.id),
		enabled: isOpen,
	});
	const conversationEntries = useMemo(
		() =>
			conversationChain.map((conversationRequest) => ({
				requestBody: decodeBase64Utf8(conversationRequest.request.body),
				responseBody: decodeBase64Utf8(
					conversationRequest.response?.body ?? null,
				),
			})),
		[conversationChain],
	);

	const formatHeaders = (headers: Record<string, string>) =>
		formatHeadersBase(headers, beautifyMode);

	const formatBody = (body: string | null) =>
		formatBodyBase(body, beautifyMode);

	const statusCode = item.statusCode;

	if (!request) {
		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Eye className="h-5 w-5" />
							Request Details
						</DialogTitle>
						<DialogDescription className="flex items-center gap-2 flex-wrap">
							<span className="font-mono text-sm">
								{formatTimestamp(item.timestamp)}
							</span>
							<span className="font-medium">{item.method}</span>
							<span className="font-mono">{item.path}</span>
						</DialogDescription>
					</DialogHeader>
					<div
						className={`flex items-center justify-center h-32 ${
							detailError ? "text-destructive" : "text-muted-foreground"
						}`}
					>
						{detailLoading
							? "Loading request details..."
							: detailError instanceof Error
								? detailError.message
								: "Failed to load request details"}
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Eye className="h-5 w-5" />
						Request Details
					</DialogTitle>
					<DialogDescription className="flex items-center justify-between">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="font-mono text-sm">
								{formatTimestamp(item.timestamp)}
							</span>
							{statusCode && (
								<Badge variant={getStatusCodeBadgeVariant(statusCode)}>
									{statusCode}
								</Badge>
							)}
							{summary?.model && (
								<Badge variant="secondary">{summary.model}</Badge>
							)}
							{summary?.totalTokens && (
								<Badge variant="outline">
									{formatTokens(summary.totalTokens)} tokens
								</Badge>
							)}
							{summary?.costUsd && summary.costUsd > 0 && (
								<Badge variant="default">{formatCost(summary.costUsd)}</Badge>
							)}
							{request.meta.transport.rateLimited && (
								<Badge variant="warning">Rate Limited</Badge>
							)}
						</div>
						<div className="flex items-center gap-2">
							<Label htmlFor="beautify-mode" className="text-sm">
								Beautify
							</Label>
							<Switch
								id="beautify-mode"
								checked={beautifyMode}
								onCheckedChange={setBeautifyMode}
							/>
						</div>
					</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue="conversation" className="flex-1 overflow-hidden">
					<TabsList className="grid w-full grid-cols-5">
						<TabsTrigger value="conversation">Conversation</TabsTrigger>
						<TabsTrigger value="request">Request</TabsTrigger>
						<TabsTrigger value="response">Response</TabsTrigger>
						<TabsTrigger value="metadata">Metadata</TabsTrigger>
						<TabsTrigger value="tokens">Token Usage</TabsTrigger>
					</TabsList>

					<TabsContent value="conversation" className="mt-4 flex-1 min-h-0">
						{conversationLoading ? (
							<div className="flex items-center justify-center h-32 text-muted-foreground">
								Loading conversation...
							</div>
						) : conversationError ? (
							<div className="flex items-center justify-center h-32 text-destructive">
								{conversationError instanceof Error
									? conversationError.message
									: "Failed to load conversation"}
							</div>
						) : (
							<ConversationView entries={conversationEntries} />
						)}
					</TabsContent>

					<TabsContent
						value="request"
						className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]"
					>
						<div>
							<div className="flex items-center justify-between mb-2">
								<h3 className="font-semibold">Headers</h3>
								<CopyButton
									variant="ghost"
									size="sm"
									getValue={() => formatHeaders(request.request.headers)}
								>
									Copy
								</CopyButton>
							</div>
							<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
								{formatHeaders(request.request.headers)}
							</pre>
						</div>

						{request.request.body && (
							<div>
								<div className="flex items-center justify-between mb-2">
									<h3 className="font-semibold">Body</h3>
									<CopyButton
										variant="ghost"
										size="sm"
										getValue={() => formatBody(request.request.body)}
									>
										Copy
									</CopyButton>
								</div>
								<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
									{formatBody(request.request.body)}
								</pre>
							</div>
						)}
					</TabsContent>

					<TabsContent
						value="response"
						className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]"
					>
						{request.response ? (
							<>
								<div>
									<div className="flex items-center justify-between mb-2">
										<h3 className="font-semibold">Headers</h3>
										<CopyButton
											variant="ghost"
											size="sm"
											getValue={() =>
												request.response
													? formatHeaders(request.response.headers)
													: ""
											}
										>
											Copy
										</CopyButton>
									</div>
									<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
										{formatHeaders(request.response.headers)}
									</pre>
								</div>

								{request.response.body && (
									<div>
										<div className="flex items-center justify-between mb-2">
											<h3 className="font-semibold">Body</h3>
											<CopyButton
												variant="ghost"
												size="sm"
												getValue={() =>
													request.response
														? formatBody(request.response.body)
														: ""
												}
											>
												Copy
											</CopyButton>
										</div>
										<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
											{formatBody(request.response.body)}
										</pre>
									</div>
								)}
							</>
						) : (
							<div className="text-center text-muted-foreground py-8">
								{request.error ? (
									<>
										<p className="text-destructive font-medium">
											Error: {request.error}
										</p>
										<p className="mt-2">No response data available</p>
									</>
								) : (
									<p>No response data available</p>
								)}
							</div>
						)}
					</TabsContent>

					<TabsContent
						value="metadata"
						className="mt-4 overflow-y-auto max-h-[60vh]"
					>
						<div>
							<div className="flex items-center justify-between mb-2">
								<h3 className="font-semibold">Request Metadata</h3>
								<CopyButton
									variant="ghost"
									size="sm"
									getValue={() =>
										beautifyMode
											? JSON.stringify(request.meta, null, 2)
											: JSON.stringify(request.meta)
									}
								>
									Copy
								</CopyButton>
							</div>
							<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
								{beautifyMode
									? JSON.stringify(request.meta, null, 2)
									: JSON.stringify(request.meta)}
							</pre>
						</div>
					</TabsContent>

					<TabsContent
						value="tokens"
						className="mt-4 overflow-y-auto max-h-[60vh]"
					>
						<TokenUsageDisplay summary={summary} />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
