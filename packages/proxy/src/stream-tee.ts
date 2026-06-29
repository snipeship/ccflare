import { BUFFER_SIZES } from "@ccflare/core";

/**
 * Tees a ReadableStream to capture data without blocking the original stream.
 * Allows buffering stream content for analytics while maintaining streaming performance.
 */
export function teeStream(
	upstream: ReadableStream<Uint8Array>,
	options: {
		onChunk?: (chunk: Uint8Array) => void;
		onClose?: (buffered: Uint8Array[]) => void;
		onError?: (error: Error) => void;
		onCancel?: (reason: unknown) => void;
		maxBytes?: number; // Max bytes to buffer (default: 1MB)
	} = {},
): ReadableStream<Uint8Array> {
	const {
		onChunk,
		onClose,
		onError,
		onCancel,
		maxBytes = BUFFER_SIZES.STREAM_TEE_MAX_BYTES,
	} = options;
	const reader = upstream.getReader();
	const buffered: Uint8Array[] = [];
	let totalBytes = 0;
	let truncated = false;

	return new ReadableStream({
		async pull(controller) {
			try {
				const { value, done } = await reader.read();

				if (done) {
					onClose?.(buffered);
					controller.close();
					return;
				}

				// Pass through to client immediately
				controller.enqueue(value);

				// Buffer for analytics if under limit
				if (!truncated && totalBytes + value.length <= maxBytes) {
					buffered.push(value);
					totalBytes += value.length;
				} else if (!truncated) {
					truncated = true;
					// Still buffer this chunk partially to reach exactly maxBytes
					const remaining = maxBytes - totalBytes;
					if (remaining > 0) {
						buffered.push(value.slice(0, remaining));
						totalBytes = maxBytes;
					}
				}

				// Notify chunk handler
				onChunk?.(value);
			} catch (error) {
				onError?.(error as Error);
				controller.error(error);
			}
		},

		cancel(reason) {
			onCancel?.(reason);
			return reader.cancel(reason);
		},
	});
}

/**
 * Combines buffered chunks into a single Buffer
 */
export function combineChunks(chunks: Uint8Array[]): Buffer {
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const combined = Buffer.allocUnsafe(totalLength);
	let offset = 0;

	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.length;
	}

	return combined;
}
