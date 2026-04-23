import {
  Connection,
  type Commitment,
  type ConnectionConfig,
  type FetchFn,
  type FetchMiddleware,
} from "@solana/web3.js";
import { getClawdmintInternalBaseUrl, getSynapseSapToken, isSynapseSapEnabled } from "./env";
import { getSolanaRpcUrl } from "./solana-collections";

const DEFAULT_COMMITMENT: Commitment = "confirmed";

/**
 * Server-side Solana `Connection` for product flows (deploy, Metaplex launch, agent registry, mint).
 * If `SYNAPSE_SAP_TOKEN` is set, JSON-RPC is proxied through this app (`/api/synapse-sap/rpc`) to the optional
 * merchant HTTP gateway. If unset, traffic uses the public RPC only — the official SAP stack uses the
 * on-chain program + `synapse-sap-sdk` and x402 (e.g. https://explorer.oobeprotocol.ai/docs/examples/x402-payment);
 * a bearer token is not required for that path.
 */
export function getSynapseSapProxyUrl() {
  return `${getClawdmintInternalBaseUrl()}/api/synapse-sap/rpc`;
}

export function createSynapseSapFetchMiddleware(): FetchMiddleware {
  return (info: Parameters<FetchFn>[0], init: Parameters<FetchFn>[1], next) => {
    if (!isSynapseSapEnabled() || !getSynapseSapToken()) {
      next(info, init);
      return;
    }

    next(getSynapseSapProxyUrl(), init);
  };
}

export function getLaunchSolanaConnection(config?: Partial<ConnectionConfig>) {
  const baseConfig: ConnectionConfig = {
    commitment: DEFAULT_COMMITMENT,
    fetchMiddleware: createSynapseSapFetchMiddleware(),
  };

  return new Connection(getSolanaRpcUrl(), {
    ...baseConfig,
    ...config,
  });
}
