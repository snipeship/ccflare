import * as tuiCore from "@ccflare/tui-core";
import type { AccountDisplay } from "@ccflare/types";
import { AccountPresenter } from "@ccflare/ui-common";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useState } from "react";

interface AccountsScreenProps {
	onBack: () => void;
}

type Mode = "list" | "add" | "remove" | "confirmRemove" | "waitingForCode";

export function AccountsScreen({ onBack }: AccountsScreenProps) {
	const [mode, setMode] = useState<Mode>("list");
	const [accounts, setAccounts] = useState<AccountDisplay[]>([]);
	const [newAccountName, setNewAccountName] = useState("");
	const [selectedMode, setSelectedMode] = useState<"max" | "console">("max");
	const [selectedTier, setSelectedTier] = useState<1 | 5 | 20>(1);
	const [step, setStep] = useState<"name" | "mode" | "tier" | "confirm">(
		"name",
	);
	const [authCode, setAuthCode] = useState("");
	const [oauthFlowData, setOauthFlowData] =
		useState<tuiCore.OAuthFlowResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [accountToRemove, setAccountToRemove] = useState("");
	const [confirmInput, setConfirmInput] = useState("");

	useInput((input, key) => {
		if (key.escape) {
			if (mode === "confirmRemove") {
				setMode("list");
				setAccountToRemove("");
				setConfirmInput("");
			} else if (mode === "add" || mode === "waitingForCode") {
				setMode("list");
				setNewAccountName("");
				setStep("name");
				setAuthCode("");
				setOauthFlowData(null);
				setError(null);
			} else {
				onBack();
			}
		} else if (input === "q" && mode === "list") {
			onBack();
		}
	});

	const loadAccounts = useCallback(async () => {
		const data = await tuiCore.getAccounts();
		setAccounts(data);
	}, []);

	useEffect(() => {
		loadAccounts();
	}, [loadAccounts]);

	const handleBeginAddAccount = async () => {
		try {
			const flowData = await tuiCore.beginAddAccount({
				name: newAccountName,
				mode: selectedMode,
				tier: selectedTier,
			});
			setOauthFlowData(flowData);
			setMode("waitingForCode");
			setError(null);
		} catch (error) {
			setError(
				error instanceof Error ? error.message : "Failed to begin OAuth flow",
			);
		}
	};

	const handleCompleteAddAccount = async () => {
		if (!oauthFlowData || !authCode) return;

		try {
			await tuiCore.completeAddAccount({
				name: newAccountName,
				mode: selectedMode,
				tier: selectedTier,
				code: authCode,
				flowData: oauthFlowData,
			});
			await loadAccounts();
			setMode("list");
			setNewAccountName("");
			setStep("name");
			setAuthCode("");
			setOauthFlowData(null);
			setError(null);
		} catch (error) {
			setError(
				error instanceof Error ? error.message : "Failed to add account",
			);
		}
	};

	const handleRemoveAccount = (name: string) => {
		setAccountToRemove(name);
		setConfirmInput("");
		setMode("confirmRemove");
	};

	const handleConfirmRemove = async () => {
		if (confirmInput !== accountToRemove) {
			return;
		}

		try {
			await tuiCore.removeAccount(accountToRemove);
			await loadAccounts();
			setMode("list");
			setAccountToRemove("");
			setConfirmInput("");
		} catch (_error) {
			// Handle error
		}
	};

	if (mode === "add") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Add Account
				</Text>

				{step === "name" && (
					<Box flexDirection="column" marginTop={1}>
						<Text>Account name:</Text>
						<TextInput
							value={newAccountName}
							onChange={setNewAccountName}
							onSubmit={() => {
								if (newAccountName) setStep("mode");
							}}
						/>
					</Box>
				)}

				{step === "mode" && (
					<Box flexDirection="column" marginTop={1}>
						<Text>Select mode:</Text>
						<SelectInput
							items={[
								{ label: "Max (recommended)", value: "max" },
								{ label: "Console", value: "console" },
							]}
							onSelect={(item) => {
								setSelectedMode(item.value as "max" | "console");
								setStep("tier");
							}}
						/>
					</Box>
				)}

				{step === "tier" && (
					<Box flexDirection="column" marginTop={1}>
						<Text>Select tier:</Text>
						<SelectInput
							items={[
								{ label: "Tier 1 (default)", value: 1 },
								{ label: "Tier 5", value: 5 },
								{ label: "Tier 20", value: 20 },
							]}
							onSelect={(item) => {
								setSelectedTier(item.value as 1 | 5 | 20);
								handleBeginAddAccount();
							}}
						/>
					</Box>
				)}

				{error && (
					<Box marginTop={1}>
						<Text color="red">{error}</Text>
					</Box>
				)}

				<Box marginTop={2}>
					<Text dimColor>Press ESC to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (mode === "waitingForCode") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Complete Authentication
				</Text>

				<Box flexDirection="column" marginTop={1}>
					<Text>A browser window should have opened for authentication.</Text>
					<Text>After authorizing, enter the code below:</Text>

					<Box marginTop={1}>
						<Text>Authorization code:</Text>
						<TextInput
							value={authCode}
							onChange={setAuthCode}
							onSubmit={() => {
								if (authCode) handleCompleteAddAccount();
							}}
						/>
					</Box>
				</Box>

				{error && (
					<Box marginTop={1}>
						<Text color="red">{error}</Text>
					</Box>
				)}

				<Box marginTop={2}>
					<Text dimColor>Press ESC to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (mode === "confirmRemove") {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red" bold>
					⚠️ Confirm Account Removal
				</Text>

				<Box marginTop={1} marginBottom={1}>
					<Text>You are about to remove account '{accountToRemove}'.</Text>
					<Text>This action cannot be undone.</Text>
				</Box>

				<Box flexDirection="column">
					<Text>
						Type <Text bold>{accountToRemove}</Text> to confirm:
					</Text>
					<TextInput
						value={confirmInput}
						onChange={setConfirmInput}
						onSubmit={() => {
							handleConfirmRemove();
						}}
					/>
				</Box>

				{confirmInput && confirmInput !== accountToRemove && (
					<Box marginTop={1}>
						<Text color="red">Account name does not match</Text>
					</Box>
				)}

				<Box marginTop={2}>
					<Text dimColor>Press ENTER to confirm, ESC to cancel</Text>
				</Box>
			</Box>
		);
	}

	const menuItems = [
		...accounts
			.sort((a, b) => (a.priority || 0) - (b.priority || 0))
			.map((acc, index) => {
				const presenter = new AccountPresenter(acc);
				return {
					label: `#${index + 1} ${acc.name} (${presenter.tierDisplay})`,
					value: `account:${acc.name}`,
				};
			}),
		{ label: "➕ Add Account", value: "add" },
		{ label: "← Back", value: "back" },
	];

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					👥 Manage Accounts
				</Text>
			</Box>

			{accounts.length === 0 ? (
				<Text dimColor>No accounts configured</Text>
			) : (
				<Text dimColor>{accounts.length} account(s) configured</Text>
			)}

			<Box marginTop={1}>
				<SelectInput
					items={menuItems}
					onSelect={(item) => {
						if (item.value === "back") {
							onBack();
						} else if (item.value === "add") {
							setMode("add");
						} else if (item.value.startsWith("account:")) {
							const accountName = item.value.replace("account:", "");
							handleRemoveAccount(accountName);
						}
					}}
				/>
			</Box>
		</Box>
	);
}
