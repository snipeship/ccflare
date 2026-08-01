import { Check, Copy } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface CopyButtonProps {
	/**
	 * String or function returning the string to copy.
	 */
	value?: string;
	getValue?: () => string | Promise<string>;
	/**
	 * Forwarded props to underlying Button
	 */
	variant?: ComponentProps<typeof Button>["variant"];
	size?: ComponentProps<typeof Button>["size"];
	className?: string;
	/**
	 * Children to render inside the button. If provided, an icon will be shown to the left.
	 */
	children?: React.ReactNode;
	/**
	 * Optional title attribute for accessibility.
	 */
	title?: string;
}

export async function resolveCopyValue(
	lock: { current: boolean },
	producer: () => string | Promise<string>,
	writeText: (text: string) => Promise<void>,
): Promise<boolean> {
	if (lock.current) return false;
	lock.current = true;
	try {
		const text = await producer();
		if (!text) return false;
		await writeText(text);
		return true;
	} finally {
		lock.current = false;
	}
}

/**
 * A small wrapper around the standard Button that copies supplied text to the
 * clipboard and temporarily shows a "Copied!" label with a subtle animation.
 */
export function CopyButton({
	value,
	getValue,
	variant = "ghost",
	size = "sm",
	className,
	children,
	title,
}: CopyButtonProps) {
	const [copied, setCopied] = useState(false);
	const [resolving, setResolving] = useState(false);
	const resolvingRef = useRef(false);
	const timeoutRef = useRef<number | null>(null);

	const handleCopy = async () => {
		if (resolvingRef.current) return;
		setResolving(true);
		try {
			const didCopy = await resolveCopyValue(
				resolvingRef,
				typeof getValue === "function" ? getValue : () => value ?? "",
				(text) => navigator.clipboard.writeText(text),
			);
			if (didCopy) {
				setCopied(true);
				// Reset after 1.5s
				if (timeoutRef.current) {
					window.clearTimeout(timeoutRef.current);
				}
				timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
			}
		} catch (err) {
			console.error("Failed to copy", err);
		} finally {
			setResolving(false);
		}
	};

	return (
		<Button
			variant={variant}
			size={size}
			onClick={handleCopy}
			disabled={resolving}
			title={title}
			className={cn("relative overflow-hidden", className)}
		>
			{copied ? (
				<span className="animate-pulse">
					<Check className="h-4 w-4" />
				</span>
			) : children ? (
				<>
					<Copy className="h-4 w-4 mr-1" />
					{children}
				</>
			) : (
				<Copy className="h-4 w-4" />
			)}
		</Button>
	);
}
