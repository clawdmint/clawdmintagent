/**
 * fetchWithRetry — Timeout + automatic retry wrapper for fetch
 * Used by all BANKR section pages (screener, portfolio, trade, automation, predictions)
 */

interface FetchRetryOptions {
  retries?: number;
  timeoutMs?: number;
  /** Delay between retries in ms (doubles each attempt) */
  backoffMs?: number;
}

export async function fetchWithRetry(
  url: string,
  opts: RequestInit = {},
  { retries = 2, timeoutMs = 25000, backoffMs = 1000 }: FetchRetryOptions = {}
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);

      // Return successful responses (let caller parse JSON)
      if (res.ok) return res;

      // Non-ok: try to get error message from body
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(body.error || `Server responded with ${res.status}`);
    } catch (e: unknown) {
      clearTimeout(timer);
      const err = e instanceof Error ? e : new Error(String(e));

      if (err.name === "AbortError") {
        lastError = new Error("Request timed out — server took too long to respond");
      } else {
        lastError = err;
      }

      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

/**
 * Extract a user-friendly error message from a caught error
 */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "AbortError") return "Request timed out";
    return e.message;
  }
  return "An unexpected error occurred";
}
