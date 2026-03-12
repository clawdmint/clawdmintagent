import { PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import {
  buildCollectionOwnerAuthMessage,
  isFreshCollectionOwnerAuthTimestamp,
  type CollectionOwnerAuthAction,
} from "./collection-owner-auth";

interface VerifyCollectionOwnerAuthInput {
  action: CollectionOwnerAuthAction;
  collectionAddress: string;
  expectedWallet: string;
  wallet: string;
  timestamp: number;
  signature: string;
  launchTxHash?: string | null;
}

export function verifyCollectionOwnerAuth(input: VerifyCollectionOwnerAuthInput): boolean {
  try {
    if (input.wallet.trim() !== input.expectedWallet.trim()) {
      return false;
    }

    if (!isFreshCollectionOwnerAuthTimestamp(input.timestamp)) {
      return false;
    }

    const message = buildCollectionOwnerAuthMessage({
      action: input.action,
      collectionAddress: input.collectionAddress,
      wallet: input.wallet,
      timestamp: input.timestamp,
      launchTxHash: input.launchTxHash,
    });

    const signature = Buffer.from(input.signature, "base64");
    const publicKey = new PublicKey(input.wallet).toBytes();
    const messageBytes = new TextEncoder().encode(message);
    return ed25519.verify(signature, messageBytes, publicKey);
  } catch {
    return false;
  }
}
