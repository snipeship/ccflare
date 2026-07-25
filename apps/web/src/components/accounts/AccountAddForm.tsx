import {
	ACCOUNT_PROVIDER_OPTIONS,
	type AccountProvider,
	type ApiKeyProvider,
	type AuthSessionStatus,
	isApiKeyProvider,
	isDeviceCodeProvider,
	isOAuthProvider,
	type OAuthProvider,
} from "@ccflare/types";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

interface AccountAddFormProps {
	onCreateApiKeyAccount: (params: {
		name: string;
		provider: ApiKeyProvider;
		apiKey: string;
	}) => Promise<void>;
	onStartOAuth: (params: {
		name: string;
		provider: OAuthProvider;
	}) => Promise<{ authUrl: string; sessionId: string }>;
	onCompleteOAuth: (params: {
		provider: OAuthProvider;
		sessionId: string;
		code: string;
	}) => Promise<void>;
	onGetSessionStatus: (
		sessionId: string,
	) => Promise<{ status: AuthSessionStatus }>;
	onOAuthCompleted: () => Promise<void>;
	onCancel: () => void;
	onSuccess: () => void;
	onError: (error: string) => void;
}

export function AccountAddForm({
	onCreateApiKeyAccount,
	onStartOAuth,
	onCompleteOAuth,
	onGetSessionStatus,
	onOAuthCompleted,
	onCancel,
	onSuccess,
	onError,
}: AccountAddFormProps) {
	const [authStep, setAuthStep] = useState<"form" | "waiting">("form");
	const [sessionId, setSessionId] = useState("");
	const [authUrl, setAuthUrl] = useState("");
	const [authorizationCode, setAuthorizationCode] = useState("");
	const [isCompletingOAuth, setIsCompletingOAuth] = useState(false);
	const [newAccount, setNewAccount] = useState({
		name: "",
		provider: "" as "" | AccountProvider,
		apiKey: "",
	});
	const selectedApiKeyProvider = isApiKeyProvider(newAccount.provider)
		? newAccount.provider
		: null;
	const selectedOAuthProvider = isOAuthProvider(newAccount.provider)
		? newAccount.provider
		: null;
	// Device-grant providers (e.g. Kimi) never show the user a code: the server
	// polls the token endpoint after the user approves in the browser.
	const isDeviceGrant =
		selectedOAuthProvider !== null &&
		isDeviceCodeProvider(selectedOAuthProvider);

	const resetForm = useCallback(() => {
		setAuthStep("form");
		setSessionId("");
		setAuthUrl("");
		setAuthorizationCode("");
		setIsCompletingOAuth(false);
		setNewAccount({ name: "", provider: "", apiKey: "" });
	}, []);

	useEffect(() => {
		if (authStep !== "waiting" || !sessionId) {
			return;
		}

		let cancelled = false;
		const pollStatus = async () => {
			try {
				const { status } = await onGetSessionStatus(sessionId);
				if (cancelled) {
					return;
				}

				if (status === "completed") {
					await onOAuthCompleted();
					if (cancelled) {
						return;
					}
					resetForm();
					onSuccess();
					return;
				}

				if (status === "expired") {
					resetForm();
					onError("Authorization session expired or failed. Please try again.");
				}
			} catch (error) {
				if (!cancelled) {
					onError(
						error instanceof Error
							? error.message
							: "Failed to check authorization status",
					);
				}
			}
		};

		void pollStatus();
		const interval = setInterval(() => {
			void pollStatus();
		}, 2000);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [
		authStep,
		onError,
		onGetSessionStatus,
		onOAuthCompleted,
		onSuccess,
		sessionId,
		resetForm,
	]);

	const handleAddAccount = async () => {
		if (!newAccount.name) {
			onError("Account name is required");
			return;
		}
		if (!newAccount.provider) {
			onError("Provider is required");
			return;
		}
		if (selectedApiKeyProvider) {
			if (!newAccount.apiKey) {
				onError("API key is required");
				return;
			}

			await onCreateApiKeyAccount({
				name: newAccount.name,
				provider: selectedApiKeyProvider,
				apiKey: newAccount.apiKey,
			});
			setNewAccount({ name: "", provider: "", apiKey: "" });
			onSuccess();
			return;
		}

		if (selectedOAuthProvider) {
			const { authUrl, sessionId } = await onStartOAuth({
				name: newAccount.name,
				provider: selectedOAuthProvider,
			});
			setSessionId(sessionId);
			setAuthUrl(authUrl);

			if (typeof window !== "undefined") {
				window.open(authUrl, "_blank", "noopener,noreferrer");
			}

			setAuthStep("waiting");

			// Device grant: nothing comes back from the browser, so ask the server
			// to start polling now. Success is picked up by the status poll above;
			// only failures need surfacing here.
			if (isDeviceCodeProvider(selectedOAuthProvider)) {
				void onCompleteOAuth({
					provider: selectedOAuthProvider,
					sessionId,
					code: "",
				}).catch((error: unknown) => {
					onError(
						error instanceof Error
							? error.message
							: "Failed to complete authorization",
					);
				});
			}
			return;
		}
	};

	const handleCancel = () => {
		resetForm();
		onCancel();
	};

	const handleCompleteOAuth = async () => {
		if (!selectedOAuthProvider || !sessionId) {
			onError("Authorization session expired or failed. Please try again.");
			return;
		}
		if (!authorizationCode.trim()) {
			onError("Authorization code is required");
			return;
		}

		setIsCompletingOAuth(true);
		try {
			await onCompleteOAuth({
				provider: selectedOAuthProvider,
				sessionId,
				code: authorizationCode.trim(),
			});
			resetForm();
			onSuccess();
		} catch (error) {
			onError(
				error instanceof Error
					? error.message
					: "Failed to complete authorization",
			);
		} finally {
			setIsCompletingOAuth(false);
		}
	};

	return (
		<div className="space-y-4 mb-6 p-4 border rounded-lg">
			<h4 className="font-medium">
				{authStep === "form" ? "Add New Account" : "Waiting for Authorization"}
			</h4>
			{authStep === "form" && (
				<>
					<div className="space-y-2">
						<Label htmlFor="name">Account Name</Label>
						<Input
							id="name"
							value={newAccount.name}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setNewAccount({
									...newAccount,
									name: (e.target as HTMLInputElement).value,
								})
							}
							placeholder="e.g., work-account or user@example.com"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="provider">Provider</Label>
						<Select
							value={newAccount.provider}
							onValueChange={(value: AccountProvider) =>
								setNewAccount({ ...newAccount, provider: value })
							}
						>
							<SelectTrigger id="provider">
								<SelectValue placeholder="Select provider" />
							</SelectTrigger>
							<SelectContent>
								{ACCOUNT_PROVIDER_OPTIONS.map((provider) => (
									<SelectItem key={provider.value} value={provider.value}>
										{provider.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{selectedApiKeyProvider && (
						<div className="space-y-2">
							<Label htmlFor="api-key">API Key</Label>
							<Input
								id="api-key"
								type="password"
								value={newAccount.apiKey}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setNewAccount({
										...newAccount,
										apiKey: (e.target as HTMLInputElement).value,
									})
								}
								placeholder={
									selectedApiKeyProvider === "anthropic"
										? "sk-ant-..."
										: "sk-proj-..."
								}
							/>
						</div>
					)}
					{selectedOAuthProvider && (
						<div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
							This provider uses OAuth. Click{" "}
							<span className="font-medium text-foreground">Start OAuth</span>{" "}
							to open the authorization flow in a new tab.{" "}
							{isDeviceGrant
								? "Approve the device authorization there; there is no code to paste."
								: "ccflare will detect completion automatically."}
						</div>
					)}
				</>
			)}
			{authStep === "form" ? (
				<div className="flex gap-2">
					<Button onClick={handleAddAccount}>
						{selectedOAuthProvider ? "Start OAuth" : "Add Account"}
					</Button>
					<Button variant="outline" onClick={handleCancel}>
						Cancel
					</Button>
				</div>
			) : (
				<>
					<div className="space-y-3">
						<p className="text-sm text-muted-foreground">
							A new browser tab has opened for authentication. Finish the
							provider sign-in flow and this page will update automatically
							every 2 seconds.
							{isDeviceGrant
								? " This provider has no code to paste: just approve the device authorization in the new tab."
								: ""}
						</p>
						<div className={isDeviceGrant ? "hidden" : "space-y-2"}>
							<Label htmlFor="authorization-code">Authorization Code</Label>
							<Input
								id="authorization-code"
								value={authorizationCode}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setAuthorizationCode((e.target as HTMLInputElement).value)
								}
								placeholder="Paste the authorization code here if the provider shows one"
							/>
							<p className="text-sm text-muted-foreground">
								Use this if the provider gives you a code instead of redirecting
								back automatically.
							</p>
						</div>
						{authUrl && (
							<Button
								variant="outline"
								onClick={() => {
									if (typeof window !== "undefined") {
										window.open(authUrl, "_blank", "noopener,noreferrer");
									}
								}}
							>
								Open Authorization Page Again
							</Button>
						)}
					</div>
					<div className="flex gap-2">
						{!isDeviceGrant && (
							<Button
								onClick={() => {
									void handleCompleteOAuth();
								}}
								disabled={isCompletingOAuth || !authorizationCode.trim()}
							>
								{isCompletingOAuth ? "Completing..." : "Submit Code"}
							</Button>
						)}
						<Button variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
