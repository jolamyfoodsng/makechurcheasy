const inflightRequests = new Map<string, Promise<unknown>>();

export function deduplicatedRequest<T>(
  key: string,
  request: () => Promise<T>,
): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = request().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const numericSeconds = Number(value);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return numericSeconds * 1000;
  }

  const retryDateMs = Date.parse(value);
  if (!Number.isFinite(retryDateMs)) {
    return null;
  }

  return Math.max(0, retryDateMs - Date.now());
}

function isRetryableStatus(status: number): boolean {
  if (status === 429) return true;
  return status >= 500 && status !== 501;
}

export interface JsonRequestWithRetryOptions extends RequestInit {
  dedupeKey: string;
  retryDelaysMs?: number[];
  jitterMs?: number;
}

export async function requestJsonWithRetry<T>(
  input: RequestInfo | URL,
  options: JsonRequestWithRetryOptions,
): Promise<{ response: Response; data: T }> {
  const {
    dedupeKey,
    retryDelaysMs = [1000, 3000, 10000],
    jitterMs = 250,
    ...init
  } = options;

  return deduplicatedRequest(dedupeKey, async () => {
    let lastResponse: Response | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try {
        const response = await fetch(input, init);

        if (!isRetryableStatus(response.status) || attempt === retryDelaysMs.length) {
          const data = (await response.json().catch(() => null)) as T;
          return { response, data };
        }

        lastResponse = response;
        const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
        const baseDelay = retryAfterMs ?? retryDelaysMs[attempt];
        const jitter = Math.floor(Math.random() * Math.max(1, jitterMs));
        await sleep(baseDelay + jitter);
      } catch (error) {
        lastError = error;
        if (attempt === retryDelaysMs.length) {
          throw error;
        }

        const delay = retryDelaysMs[attempt] + Math.floor(Math.random() * Math.max(1, jitterMs));
        await sleep(delay);
      }
    }

    if (lastResponse) {
      const data = (await lastResponse.json().catch(() => null)) as T;
      return { response: lastResponse, data };
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Request failed after retries");
  });
}
