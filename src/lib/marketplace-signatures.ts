import "server-only";

import { createPublicKey, randomUUID, verify } from "crypto";
import bs58 from "bs58";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const DEFAULT_LISTING_TTL_MS = 1000 * 60 * 20;

export function createListingNonce() {
  return randomUUID();
}

export function createListingExpiry(ttlMs = DEFAULT_LISTING_TTL_MS) {
  return new Date(Date.now() + ttlMs);
}

export function buildMarketplaceListingMessage(input: {
  assetAddress: string;
  collectionAddress: string;
  sellerAddress: string;
  priceLamports: string;
  nonce: string;
  expiresAtIso: string;
}) {
  return [
    "Clawdmint Marketplace Listing",
    `Asset: ${input.assetAddress}`,
    `Collection: ${input.collectionAddress}`,
    `Seller: ${input.sellerAddress}`,
    `Price (lamports): ${input.priceLamports}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAtIso}`,
  ].join("\n");
}

export function buildMarketplaceCancelListingMessage(input: {
  listingId: string;
  assetAddress: string;
  sellerAddress: string;
  nonce: string;
  expiresAtIso: string;
}) {
  return [
    "Clawdmint Marketplace Cancel Listing",
    `Listing: ${input.listingId}`,
    `Asset: ${input.assetAddress}`,
    `Seller: ${input.sellerAddress}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAtIso}`,
  ].join("\n");
}

function createSolanaKeyObject(walletAddress: string) {
  const rawPublicKey = Buffer.from(bs58.decode(walletAddress));
  if (rawPublicKey.length !== 32) {
    throw new Error("Invalid Solana public key length");
  }

  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
    format: "der",
    type: "spki",
  });
}

export function verifyMarketplaceSignature(input: {
  walletAddress: string;
  message: string;
  signatureBase64: string;
}) {
  const keyObject = createSolanaKeyObject(input.walletAddress);
  const signature = Buffer.from(input.signatureBase64, "base64");
  return verify(null, Buffer.from(input.message, "utf8"), keyObject, signature);
}
