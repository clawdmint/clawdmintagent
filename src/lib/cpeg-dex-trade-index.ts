import { randomBytes } from "crypto";

const DEX_TRADE_NS = BigInt("0xdeb103d000000000");

/**
 * uPEG maps every discrete swap/trade onto a deterministic art slug. Marketplace fills use the
 * `peg_id` as the canonical `trade_index`, but aggregator swaps need a disjoint namespace so we
 * never collide with an identity peg index. Dex trades therefore claim `0xdeb103d…` prefixed ids.
 *
 * Callers stringify for URLs (`/trade-art/[tradeIndex]/svg`).
 */
export function allocateDexAggregatorTradeIndex(): bigint {
  const rnd = BigInt(randomBytes(6).readUIntBE(0, 6));
  return DEX_TRADE_NS + rnd;
}
