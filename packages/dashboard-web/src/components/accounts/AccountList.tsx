import { useState } from "react";
import type { Account } from "../../api";
import { AccountListItem } from "./AccountListItem";

interface AccountListProps {
	accounts: Account[] | undefined;
	onPauseToggle: (account: Account) => void;
	onRemove: (name: string) => void;
	onRename: (account: Account) => void;
	onReorder?: (accounts: Account[]) => void;
}

export function AccountList({
	accounts,
	onPauseToggle,
	onRemove,
	onRename,
	onReorder,
}: AccountListProps) {
	const [draggedAccount, setDraggedAccount] = useState<Account | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

	if (!accounts || accounts.length === 0) {
		return <p className="text-muted-foreground">No accounts configured</p>;
	}

	// Sort accounts by priority first, then by most recently used
	const sortedAccounts = [...accounts].sort((a, b) => {
		// Primary sort: priority (lower values = higher priority)
		if (a.priority !== b.priority) {
			return (a.priority || 0) - (b.priority || 0);
		}
		// Secondary sort: most recently used
		if (a.lastUsed && b.lastUsed) {
			return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
		}
		if (a.lastUsed) return -1;
		if (b.lastUsed) return 1;
		return 0;
	});

	// Find the most recently used account
	const mostRecentAccountId = accounts.reduce(
		(mostRecent, account) => {
			if (!account.lastUsed) return mostRecent;
			if (!mostRecent) return account.id;

			const mostRecentAccount = accounts.find((a) => a.id === mostRecent);
			if (!mostRecentAccount?.lastUsed) return account.id;

			const mostRecentLastUsed = new Date(mostRecentAccount.lastUsed).getTime();
			const currentLastUsed = new Date(account.lastUsed).getTime();

			return currentLastUsed > mostRecentLastUsed ? account.id : mostRecent;
		},
		null as string | null,
	);

	const handleDragStart = (account: Account) => {
		setDraggedAccount(account);
	};

	const handleDragEnd = () => {
		setDraggedAccount(null);
		setDragOverIndex(null);
	};

	const handleDragOver = (e: React.DragEvent, index: number) => {
		e.preventDefault();
		setDragOverIndex(index);
	};

	const handleDrop = (e: React.DragEvent, dropIndex: number) => {
		e.preventDefault();
		if (!draggedAccount || !onReorder) return;

		const draggedIndex = sortedAccounts.findIndex(
			(acc) => acc.id === draggedAccount.id,
		);
		if (draggedIndex === dropIndex) return;

		// Create new array with reordered accounts
		const newAccounts = [...sortedAccounts];
		newAccounts.splice(draggedIndex, 1);
		newAccounts.splice(dropIndex, 0, draggedAccount);

		// Update priorities based on new order
		const accountsWithNewPriorities = newAccounts.map((account, index) => ({
			...account,
			priority: index,
		}));

		onReorder(accountsWithNewPriorities);
		setDraggedAccount(null);
		setDragOverIndex(null);
	};

	return (
		<div className="space-y-2">
			{onReorder && (
				<p className="text-sm text-muted-foreground mb-4">
					💡 Drag and drop accounts to reorder them. Higher accounts will be
					prioritized.
				</p>
			)}
			{sortedAccounts.map((account, index) => (
				<div
					key={account.name}
					draggable={!!onReorder}
					onDragStart={() => handleDragStart(account)}
					onDragEnd={handleDragEnd}
					onDragOver={(e) => handleDragOver(e, index)}
					onDrop={(e) => handleDrop(e, index)}
					className={`
						${onReorder ? "cursor-move" : ""}
						${draggedAccount?.id === account.id ? "opacity-50" : ""}
						${dragOverIndex === index ? "ring-2 ring-blue-500 ring-offset-2" : ""}
					`}
				>
					<div className="flex items-center gap-2">
						{onReorder && (
							<div className="flex flex-col text-xs text-muted-foreground">
								<span className="font-mono">#{index + 1}</span>
							</div>
						)}
						<div className="flex-1">
							<AccountListItem
								account={account}
								isActive={account.id === mostRecentAccountId}
								onPauseToggle={onPauseToggle}
								onRemove={onRemove}
								onRename={onRename}
							/>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
