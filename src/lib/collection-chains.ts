import { formatEther, parseEther } from "viem";
import {
  getNetworkFromValue,
  isEvmAddress,
  isSolanaAddress,
  type SupportedNetworkId,
} from "./network-config";

export type CollectionChain = SupportedNetworkId;
export const SOLANA_COLLECTION_CHAINS: CollectionChain[] = ["solana", "solana-devnet"];

const LAMPORTS_PER_SOL = BigInt("1000000000");

function parseDecimalAmount(input: string, decimals: number): bigint {
  const normalized = input.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Invalid native token amount");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0");
  const trimmedFraction = paddedFraction.slice(0, decimals);
  const scale = BigInt(`1${"0".repeat(decimals)}`);
  return BigInt(whole) * scale + BigInt(trimmedFraction || "0");
}

export function normalizeCollectionChain(chain?: string | null): CollectionChain {
  return getNetworkFromValue(chain).id;
}

export function isSolanaCollectionChain(chain?: string | null): boolean {
  return getNetworkFromValue(chain).family === "solana";
}

export function isEvmCollectionChain(chain?: string | null): boolean {
  return getNetworkFromValue(chain).family === "evm";
}

export function getCollectionNativeToken(chain?: string | null): string {
  return getNetworkFromValue(chain).nativeToken;
}

export function normalizeCollectionAddress(address: string, chain?: string | null): string {
  return isEvmCollectionChain(chain) ? address.toLowerCase() : address;
}

export function validateCollectionPayoutAddress(address: string, chain?: string | null): boolean {
  return isSolanaCollectionChain(chain) ? isSolanaAddress(address) : isEvmAddress(address);
}

export function parseCollectionMintPrice(input: string, chain?: string | null): string {
  if (isSolanaCollectionChain(chain)) {
    return parseDecimalAmount(input, 9).toString();
  }

  return parseEther(input).toString();
}

export function formatCollectionMintPrice(amount: string, chain?: string | null): string {
  if (isSolanaCollectionChain(chain)) {
    const lamports = BigInt(amount || "0");
    const whole = lamports / LAMPORTS_PER_SOL;
    const fraction = lamports % LAMPORTS_PER_SOL;
    if (fraction === BigInt(0)) {
      return whole.toString();
    }

    const decimals = fraction.toString().padStart(9, "0").replace(/0+$/, "");
    return `${whole}.${decimals}`;
  }

  return formatEther(BigInt(amount || "0"));
}

export function resolveMintPriceInput(
  chain: CollectionChain,
  values: {
    mint_price?: string | undefined;
    mint_price_eth?: string | undefined;
    mint_price_sol?: string | undefined;
  }
): string | null {
  if (values.mint_price) {
    return values.mint_price;
  }

  return isSolanaCollectionChain(chain) ? (values.mint_price_sol ?? null) : (values.mint_price_eth ?? null);
}
