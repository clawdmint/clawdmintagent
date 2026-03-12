export const COLLECTION_OWNER_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

export type CollectionOwnerAuthAction = "prepare_bags" | "confirm_bags";

export interface CollectionOwnerAuthMessageInput {
  action: CollectionOwnerAuthAction;
  collectionAddress: string;
  wallet: string;
  timestamp: number;
  launchTxHash?: string | null;
}

export function buildCollectionOwnerAuthMessage(input: CollectionOwnerAuthMessageInput): string {
  const lines = [
    "Clawdmint owner authorization",
    `action:${input.action}`,
    `collection:${input.collectionAddress.trim()}`,
    `wallet:${input.wallet.trim()}`,
    `timestamp:${input.timestamp}`,
  ];

  if (input.launchTxHash) {
    lines.push(`launch_tx:${input.launchTxHash.trim()}`);
  }

  return lines.join("\n");
}

export function isFreshCollectionOwnerAuthTimestamp(timestamp: number, now = Date.now()): boolean {
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const drift = Math.abs(now - timestamp);
  return drift <= COLLECTION_OWNER_AUTH_MAX_AGE_MS;
}
