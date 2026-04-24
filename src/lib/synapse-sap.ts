import { Connection } from "@solana/web3.js";
import { getClawdmintInternalBaseUrl, getSynapseSapToken, isSynapseSapEnabled } from "./env";
import { getSolanaRpcUrl } from "./solana-collections";

const DEFAULT_COMMITMENT = "confirmed" as const;

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

function chainFetch(
  info: RequestInfo,
  init: RequestInit | undefined,
  next: (i: RequestInfo, u?: RequestInit) => void
) {
  if (!isSynapseSapEnabled() || !getSynapseSapToken()) {
    next(info, init);
    return;
  }
  next(getSynapseSapProxyUrl(), init);
}

export function createSynapseSapFetchMiddleware() {
  return chainFetch;
}

export function getLaunchSolanaConnection(
  config?: NonNullable<ConstructorParameters<typeof Connection>[1]> extends infer O
    ? O extends string | undefined
      ? never
      : Partial<Exclude<O, string | undefined>>
    : never
) {
  const baseConfig = {
    commitment: DEFAULT_COMMITMENT,
    fetchMiddleware: createSynapseSapFetchMiddleware(),
  };

  return new Connection(getSolanaRpcUrl(), {
    ...baseConfig,
    ...config,
  } as NonNullable<ConstructorParameters<typeof Connection>[1]>);
}
