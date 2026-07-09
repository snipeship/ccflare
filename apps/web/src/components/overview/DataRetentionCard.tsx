import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
	useCleanupNow,
	useCompactDb,
	useRetention,
	useSetRetention,
} from "../../hooks/queries";
import { useApiError } from "../../hooks/useApiError";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";

export function DataRetentionCard() {
	const { formatError } = useApiError();
	const { data, isLoading } = useRetention();
	const setRetention = useSetRetention();
	const cleanupNow = useCleanupNow();
	const compactDb = useCompactDb();
	const [payloadDays, setPayloadDays] = useState<number>(
		data?.payloadDays ?? 7,
	);
	const [requestDays, setRequestDays] = useState<number>(
		data?.requestDays ?? 365,
	);

	useEffect(() => {
		if (typeof data?.payloadDays === "number") setPayloadDays(data.payloadDays);
		if (typeof data?.requestDays === "number") setRequestDays(data.requestDays);
	}, [data?.payloadDays, data?.requestDays]);

	const disabled = isLoading || setRetention.isPending;
	const validPayload =
		Number.isFinite(payloadDays) && payloadDays >= 1 && payloadDays <= 365;
	const validRequests =
		Number.isFinite(requestDays) && requestDays >= 1 && requestDays <= 3650;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Payload Retention</CardTitle>
				<CardDescription>
					Automatically delete request/response payloads older than this window.
					Analytics remain intact.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium w-28">Payloads</span>
						<Input
							type="number"
							min={1}
							max={365}
							value={payloadDays}
							onChange={(e) =>
								setPayloadDays(parseInt(e.target.value || "0", 10))
							}
							className="w-24"
						/>
						<span className="text-sm text-muted-foreground">days</span>
					</div>
					<Button
						size="sm"
						disabled={disabled || !validPayload}
						onClick={() => setRetention.mutate({ payloadDays })}
					>
						Save
					</Button>
				</div>

				<div className="flex items-center gap-2">
					{[7, 14, 30, 90].map((d) => (
						<Button
							key={d}
							variant="outline"
							size="sm"
							onClick={() => setPayloadDays(d)}
						>
							{d}d
						</Button>
					))}
				</div>

				<div className="flex items-center gap-2 pt-2">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium w-28">Requests</span>
						<Input
							type="number"
							min={1}
							max={3650}
							value={requestDays}
							onChange={(e) =>
								setRequestDays(parseInt(e.target.value || "0", 10))
							}
							className="w-24"
						/>
						<span className="text-sm text-muted-foreground">days</span>
					</div>
					<Button
						size="sm"
						disabled={disabled || !validRequests}
						onClick={() => setRetention.mutate({ requestDays })}
					>
						Save
					</Button>
				</div>

				<div className="pt-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => cleanupNow.mutate()}
						disabled={cleanupNow.isPending}
					>
						{cleanupNow.isPending ? "Cleaning up..." : "Clean up now"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="ml-2"
						onClick={() => compactDb.mutate()}
						disabled={compactDb.isPending}
					>
						{compactDb.isPending ? "Compacting..." : "Compact database"}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					Compacting a large database can take a while and may briefly pause
					request handling while it runs.
				</p>

				{cleanupNow.isError && (
					<div className="flex items-center gap-2 text-xs text-destructive">
						<AlertCircle className="h-3 w-3" />
						{formatError(cleanupNow.error)}
					</div>
				)}
				{cleanupNow.data && (
					<p className="text-xs text-muted-foreground">
						Removed {cleanupNow.data.removedRequests} requests and{" "}
						{cleanupNow.data.removedPayloads} payloads older than{" "}
						{new Date(cleanupNow.data.cutoffIso).toLocaleString()}.
					</p>
				)}

				{compactDb.isError && (
					<div className="flex items-center gap-2 text-xs text-destructive">
						<AlertCircle className="h-3 w-3" />
						{formatError(compactDb.error)}
					</div>
				)}
				{compactDb.isSuccess && (
					<p className="text-xs text-muted-foreground">
						Database compacted. File size should reduce on disk.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
