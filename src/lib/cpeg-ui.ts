// Shared cPEG UI utilities. Keep this file framework-neutral so that it can be imported from
// both server components and client components without dragging in extra dependencies.

export function truncateAddress(address: string | null | undefined, head = 4, tail = 4): string {
  if (!address) return "--";
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function truncateSignature(signature: string | null | undefined): string {
  return truncateAddress(signature, 6, 6);
}

export function explorerTxUrl(signature: string, cluster: string): string {
  const suffix = cluster === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}

export function explorerAddressUrl(address: string, cluster: string): string {
  const suffix = cluster === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/address/${address}${suffix}`;
}

const RELATIVE_DIVISIONS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

export function formatRelativeTime(input: string | number | Date | null | undefined): string {
  if (!input) return "--";
  const target = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(target.getTime())) return "--";
  const now = Date.now();
  let diffSeconds = (target.getTime() - now) / 1000;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let unit: Intl.RelativeTimeFormatUnit = "second";
  for (const [step, candidate] of RELATIVE_DIVISIONS) {
    if (Math.abs(diffSeconds) < step) {
      unit = candidate;
      break;
    }
    diffSeconds /= step;
    unit = candidate;
  }
  return formatter.format(Math.round(diffSeconds), unit);
}

export function formatLamportsToSol(lamports: string | number | bigint, fractionDigits = 4): string {
  let value: bigint;
  try {
    value = typeof lamports === "bigint" ? lamports : BigInt(typeof lamports === "number" ? Math.floor(lamports) : lamports);
  } catch {
    return "0";
  }
  return (Number(value) / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
}

export function formatSolDelta(input: { previous: string; current: string }): { delta: string; positive: boolean } {
  try {
    const previous = BigInt(input.previous || "0");
    const current = BigInt(input.current || "0");
    if (previous === current) return { delta: "0%", positive: false };
    if (previous === BigInt(0)) return { delta: "+inf", positive: true };
    const ratio = (Number(current) - Number(previous)) / Number(previous);
    const sign = ratio >= 0 ? "+" : "";
    return { delta: `${sign}${(ratio * 100).toFixed(2)}%`, positive: ratio >= 0 };
  } catch {
    return { delta: "0%", positive: false };
  }
}

// Sanitize raw error messages to a short, user-facing string. Keeps internal infrastructure
// vocabulary out of the UI, while preserving useful preflight 4xx hints from our own APIs.
const FRIENDLY_ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/program error/i, "On-chain rejected the transaction."],
  [/blockhash not found/i, "Network is busy. Please try again."],
  [/transaction simulation failed/i, "Transaction simulation failed. Please try again."],
  [/insufficient lamports/i, "Wallet has not enough SOL."],
  [/insufficient funds/i, "Wallet has not enough SOL."],
  [/already been processed/i, "Already processed by the network."],
  [/account not found/i, "On-chain account is not initialized yet."],
  [/invalid account data/i, "Account state is stale. Please refresh and try again."],
  [/user rejected/i, "Wallet signature was cancelled."],
  [/timeout/i, "Network timed out. Please try again."],
  [/getaddrinfo|enotfound|econnrefused|fetch failed/i, "Network is temporarily unavailable."],
];

export function describeError(error: unknown, fallback = "Something went wrong."): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return fallback;
  for (const [pattern, friendly] of FRIENDLY_ERROR_PATTERNS) {
    if (pattern.test(raw)) return friendly;
  }
  // Trim very long messages and strip stack traces.
  const oneLine = raw.split("\n")[0]?.trim() || fallback;
  if (oneLine.length > 160) return `${oneLine.slice(0, 160)}…`;
  return oneLine;
}

export function safeParseInt(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function bpsToPercent(bps: number | null | undefined, digits = 2): string {
  const safe = typeof bps === "number" && Number.isFinite(bps) ? bps : 0;
  return `${(safe / 100).toFixed(digits)}%`;
}

export const CLAWDMINT_INK = "#f7f2df";
export const CLAWDMINT_CYAN = "#53c7ff";
