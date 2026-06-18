export class StorageTimeoutError extends Error {}

const DEFAULT_TIMEOUT_MS = parseInt(process.env.STORAGE_OPERATION_TIMEOUT_MS || '15000', 10);

/**
 * Races a storage operation against a timeout so a slow/unresponsive NAS
 * or FTP server can't hang an upload request indefinitely. Doesn't abort
 * the underlying network call (the FTP/WebDAV client may still finish in
 * the background) — it just stops the caller from waiting past `ms`, so
 * the request can fail cleanly instead of hanging.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new StorageTimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
