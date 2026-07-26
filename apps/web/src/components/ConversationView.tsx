import { ContentBlockType, type MessageData } from "@ccflare/types";
import {
	cleanLineNumbers,
	genMessageKey,
	parseAssistantMessage,
	parseRequestMessages,
} from "@ccflare/ui";
import React, { useMemo } from "react";
import { Message } from "./conversation";

interface ConversationEntry {
	requestBody: string | null;
	responseBody: string | null;
}

interface ConversationViewProps {
	requestBody?: string | null;
	responseBody?: string | null;
	entries?: ConversationEntry[];
	linebreak?: boolean;
	expanded?: boolean;
}

function ConversationViewComponent({
	requestBody,
	responseBody,
	entries,
	linebreak = false,
	expanded = false,
}: ConversationViewProps) {
	const messages = useMemo(() => {
		const resolvedEntries =
			entries && entries.length > 0
				? entries
				: [
						{
							requestBody: requestBody ?? null,
							responseBody: responseBody ?? null,
						},
					];
		const allMessages: MessageData[] = [];

		for (const entry of resolvedEntries) {
			const requestMessages = parseRequestMessages(entry.requestBody ?? null);
			const assistantMessage = parseAssistantMessage(
				entry.responseBody ?? null,
			);

			allMessages.push(...requestMessages);

			if (assistantMessage) {
				allMessages.push(assistantMessage);
			}

			if (requestMessages.length === 0 && entry.requestBody) {
				allMessages.push({
					role: "user",
					content: entry.requestBody,
					contentBlocks: [
						{ type: ContentBlockType.Text, text: entry.requestBody },
					],
					tools: [],
					toolResults: [],
				});
			}

			if (!assistantMessage && entry.responseBody) {
				allMessages.push({
					role: "assistant",
					content: entry.responseBody,
					contentBlocks: [
						{ type: ContentBlockType.Text, text: entry.responseBody },
					],
					tools: [],
					toolResults: [],
				});
			}
		}

		return allMessages;
	}, [entries, requestBody, responseBody]);

	if (messages.length === 0) {
		return (
			<div className="flex items-center justify-center h-32">
				<p className="text-muted-foreground">No conversation data available</p>
			</div>
		);
	}

	return (
		<div
			className={`w-full overflow-hidden ${expanded ? "h-full" : "h-[calc(65vh-10rem)]"}`}
		>
			<div className="h-full w-full overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3">
				{messages.map((message, index) => (
					<Message
						key={genMessageKey(message, index)}
						role={message.role}
						content={message.content}
						contentBlocks={message.contentBlocks}
						tools={message.tools}
						toolResults={message.toolResults}
						cleanLineNumbers={cleanLineNumbers}
						linebreak={linebreak}
					/>
				))}
			</div>
		</div>
	);
}

export const ConversationView = React.memo(ConversationViewComponent);
