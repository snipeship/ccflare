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
import { Eye, Maximize2, Minimize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { queryKeys } from "../lib/query-keys";
import { getStatusCodeBadgeVariant } from "../lib/request-status";
import { ConversationView } from "./ConversationView";
import { CopyButton } from "./CopyButton";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
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
	request: RequestPayload;
	summary: RequestSummary | undefined;
	isOpen: boolean;
	onClose: () => void;
}

export function RequestDetailsModal({
	request,
	summary,
	isOpen,
	onClose,
}: RequestDetailsModalProps) {
	const [beautifyMode, setBeautifyMode] = useState(true);
	const [linebreakMode, setLinebreakMode] = useState(false);
	const [activeTab, setActiveTab] = useState("conversation");
	const [expanded, setExpanded] = useState(false);
	const {
		data: conversationChain = [],
		isLoading: conversationLoading,
		error: conversationError,
	} = useQuery({
		queryKey: queryKeys.requestConversation(request.id),
		queryFn: () => api.getRequestConversation(request.id),
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

	const statusCode = request.response?.status;

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setExpanded(false);
			onClose();
		}
	};

	const conversationContent = conversationLoading ? (
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
		<ConversationView
			entries={conversationEntries}
			linebreak={linebreakMode}
			expanded={expanded}
		/>
	);

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent
				className={`max-w-4xl max-h-[90vh] overflow-hidden flex flex-col ${
					expanded
						? "left-0 top-0 translate-x-0 translate-y-0 w-full max-w-none max-h-none h-full rounded-none"
						: ""
				}`}
				onEscapeKeyDown={(e) => {
					if (expanded) {
						e.preventDefault();
						setExpanded(false);
					}
				}}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Eye className="h-5 w-5" />
						Request Details
					</DialogTitle>
					<DialogDescription className="flex items-center justify-between">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="font-mono text-sm">
								{formatTimestamp(request.meta.trace.timestamp)}
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
						<div className="flex items-center gap-4">
							{(activeTab === "conversation" || expanded) && (
								<div className="flex items-center gap-2">
									<Label htmlFor="linebreak-mode" className="text-sm">
										Linebreak
									</Label>
									<Switch
										id="linebreak-mode"
										checked={linebreakMode}
										onCheckedChange={setLinebreakMode}
									/>
								</div>
							)}
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
						</div>
					</DialogDescription>
				</DialogHeader>

				{expanded ? (
					<div className="flex-1 min-h-0 mt-4 overflow-hidden">
						{conversationContent}
					</div>
				) : (
					<Tabs
						value={activeTab}
						onValueChange={setActiveTab}
						className="flex-1 overflow-hidden"
					>
						<TabsList className="grid w-full grid-cols-5">
							<TabsTrigger value="conversation">Conversation</TabsTrigger>
							<TabsTrigger value="request">Request</TabsTrigger>
							<TabsTrigger value="response">Response</TabsTrigger>
							<TabsTrigger value="metadata">Metadata</TabsTrigger>
							<TabsTrigger value="tokens">Token Usage</TabsTrigger>
						</TabsList>

						<TabsContent value="conversation" className="mt-4 flex-1 min-h-0">
							{conversationContent}
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
				)}

				{(activeTab === "conversation" || expanded) && (
					<Button
						variant="secondary"
						size="icon"
						className="absolute bottom-4 right-4 z-10 shadow-lg"
						onClick={() => setExpanded((prev) => !prev)}
						aria-label={
							expanded ? "Shrink conversation view" : "Expand conversation view"
						}
					>
						{expanded ? (
							<Minimize2 className="h-4 w-4" />
						) : (
							<Maximize2 className="h-4 w-4" />
						)}
					</Button>
				)}
			</DialogContent>
		</Dialog>
	);
}
