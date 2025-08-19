import type { MigrationProgress } from "@ccflare/database";
import { Box, Text, useApp } from "ink";
import Spinner from "ink-spinner";

interface MigrationProgressProps {
	progress: MigrationProgress;
}

// Simple progress bar component without external dependencies
function SimpleProgressBar({ percent }: { percent: number }) {
	const width = 40;
	const filled = Math.round(width * percent);
	const empty = width - filled;

	return (
		<Box>
			<Text color="cyan">{"█".repeat(filled)}</Text>
			<Text color="gray">{"░".repeat(empty)}</Text>
		</Box>
	);
}

export function MigrationProgressComponent({
	progress,
}: MigrationProgressProps) {
	const { exit } = useApp();

	// Exit if progress is complete
	if (progress.percentage === 100) {
		setTimeout(() => exit(), 500);
	}

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="cyan"
			padding={1}
			width={60}
		>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Database Migration in Progress
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text color="gray">{progress.operation}</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>
					<Spinner type="dots" /> {progress.current.toLocaleString()} /{" "}
					{progress.total.toLocaleString()} records
				</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text dimColor>Progress: {progress.percentage}%</Text>
				<SimpleProgressBar percent={progress.percentage / 100} />
			</Box>

			<Text dimColor>
				This is a one-time operation to enable full-text search.
			</Text>
			<Text dimColor>Please wait while we index your request data...</Text>
		</Box>
	);
}
