import bs58 from "bs58";
import {
  createAndRegisterLaunch,
  genesis,
  isGenesisApiError,
  isGenesisApiNetworkError,
  isGenesisValidationError,
  type CreateLaunchInput,
  type GenesisApiConfig,
} from "@metaplex-foundation/genesis";
import { keypairIdentity } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { getAgentOperationalKeypair, getAgentWalletBalance } from "@/lib/agent-wallets";
import { getEnv } from "@/lib/env";
import { getDexScreenerTokenUrl, getTokenExplorerUrl } from "@/lib/network-config";
import { getSolanaRpcUrl } from "@/lib/solana-collections";

type AgentTokenLaunchAgent = {
  id: string;
  name: string;
  solanaWalletAddress: string | null;
  solanaWalletEncryptedKey: string | null;
};

export class AgentTokenLaunchError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AgentTokenLaunchError";
    this.status = status;
    this.details = details;
  }
}

export interface AgentTokenLaunchResult {
  mintAddress: string;
  genesisAccount: string;
  launchId: string;
  launchUrl: string;
  signature: string | null;
  signatures: string[];
  launcherAddress: string;
  chain: "solana" | "solana-devnet";
  network: "solana-mainnet" | "solana-devnet";
  explorerUrl: string;
  dexscreenerUrl: string;
  walletBalanceSol: string;
}

function getAgentTokenNetwork(): "solana-mainnet" | "solana-devnet" {
  return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet"
    ? "solana-devnet"
    : "solana-mainnet";
}

function getAgentTokenChain(): "solana" | "solana-devnet" {
  return getAgentTokenNetwork() === "solana-devnet" ? "solana-devnet" : "solana";
}

function getGenesisApiConfig(): GenesisApiConfig {
  const configuredBaseUrl = getEnv("GENESIS_API_BASE_URL", "").trim();
  return configuredBaseUrl ? { baseUrl: configuredBaseUrl } : {};
}

export async function launchMetaplexAgentToken(
  agent: AgentTokenLaunchAgent,
  input: CreateLaunchInput
): Promise<AgentTokenLaunchResult> {
  try {
    const signer = getAgentOperationalKeypair(agent);
    const umi = createUmi(getSolanaRpcUrl());
    umi.use(keypairIdentity(fromWeb3JsKeypair(signer)));
    umi.use(genesis());

    const result = await createAndRegisterLaunch(umi, getGenesisApiConfig(), input);
    const walletBalance = await getAgentWalletBalance(signer.publicKey.toBase58());
    const signatures = result.signatures.map((signature) => bs58.encode(signature));

    return {
      mintAddress: result.mintAddress,
      genesisAccount: result.genesisAccount,
      launchId: result.launch.id,
      launchUrl: result.launch.link,
      signature: signatures[0] || null,
      signatures,
      launcherAddress: signer.publicKey.toBase58(),
      chain: getAgentTokenChain(),
      network: getAgentTokenNetwork(),
      explorerUrl: getTokenExplorerUrl(result.mintAddress, getAgentTokenChain()),
      dexscreenerUrl: getDexScreenerTokenUrl(result.mintAddress, getAgentTokenChain()),
      walletBalanceSol: walletBalance.sol,
    };
  } catch (error) {
    if (isGenesisValidationError(error)) {
      throw new AgentTokenLaunchError(400, error.message, { field: error.field });
    }

    if (isGenesisApiError(error)) {
      throw new AgentTokenLaunchError(502, error.message, error.responseBody);
    }

    if (isGenesisApiNetworkError(error)) {
      throw new AgentTokenLaunchError(502, error.message);
    }

    const message = error instanceof Error ? error.message : "Unknown Genesis launch error";
    throw new AgentTokenLaunchError(500, message);
  }
}
