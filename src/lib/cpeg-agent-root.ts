import { PublicKey } from "@solana/web3.js";

export const CPEG_IDENTITY_MODE_STANDALONE = "standalone";
export const CPEG_IDENTITY_MODE_METAPLEX_AGENT = "metaplex_agent";
export const METAPLEX_AGENT_IDENTITY_PROGRAM_ID = new PublicKey(
  "1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p"
);

export type CpegIdentityMode =
  | typeof CPEG_IDENTITY_MODE_STANDALONE
  | typeof CPEG_IDENTITY_MODE_METAPLEX_AGENT;

export interface CpegAgentRootInput {
  identityMode?: string | null;
  agentAssetAddress?: string | null;
  agentIdentityPda?: string | null;
  agentCollectionAddress?: string | null;
  agentWalletAddress?: string | null;
  agentName?: string | null;
}

export interface CpegAgentRootLink {
  identityMode: CpegIdentityMode;
  canonicalRoot: "metaplex-agent-core" | "standalone";
  agentAssetAddress: string | null;
  agentIdentityPda: string | null;
  agentCollectionAddress: string | null;
  agentWalletAddress: string | null;
  agentName: string | null;
  registryProgramId: string | null;
}

function parsePublicKey(value: string | null | undefined, label: string): InstanceType<typeof PublicKey> | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  try {
    return new PublicKey(trimmed);
  } catch {
    throw new Error(`${label} must be a valid Solana address`);
  }
}

export function deriveMetaplexAgentIdentityPda(agentAssetAddress: string): string {
  const asset = new PublicKey(agentAssetAddress);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent_identity"), asset.toBuffer()],
    METAPLEX_AGENT_IDENTITY_PROGRAM_ID
  );
  return pda.toBase58();
}

export function normalizeCpegAgentRootLink(input: CpegAgentRootInput = {}): CpegAgentRootLink {
  const requestedMode = input.identityMode === CPEG_IDENTITY_MODE_METAPLEX_AGENT
    ? CPEG_IDENTITY_MODE_METAPLEX_AGENT
    : CPEG_IDENTITY_MODE_STANDALONE;
  const asset = parsePublicKey(input.agentAssetAddress, "agent_asset_address");
  const collection = parsePublicKey(input.agentCollectionAddress, "agent_collection_address");
  const wallet = parsePublicKey(input.agentWalletAddress, "agent_wallet_address");
  const providedIdentity = parsePublicKey(input.agentIdentityPda, "agent_identity_pda");

  if (requestedMode === CPEG_IDENTITY_MODE_STANDALONE && !asset) {
    return {
      identityMode: CPEG_IDENTITY_MODE_STANDALONE,
      canonicalRoot: "standalone",
      agentAssetAddress: null,
      agentIdentityPda: null,
      agentCollectionAddress: null,
      agentWalletAddress: null,
      agentName: null,
      registryProgramId: null,
    };
  }

  if (!asset) {
    throw new Error("agent_asset_address is required for Metaplex Agent cPEG launches");
  }

  const derivedIdentity = deriveMetaplexAgentIdentityPda(asset.toBase58());
  if (providedIdentity && providedIdentity.toBase58() !== derivedIdentity) {
    throw new Error("agent_identity_pda does not match the Metaplex Agent Identity PDA for the agent asset");
  }

  return {
    identityMode: CPEG_IDENTITY_MODE_METAPLEX_AGENT,
    canonicalRoot: "metaplex-agent-core",
    agentAssetAddress: asset.toBase58(),
    agentIdentityPda: derivedIdentity,
    agentCollectionAddress: collection?.toBase58() || null,
    agentWalletAddress: wallet?.toBase58() || null,
    agentName: input.agentName?.trim() || null,
    registryProgramId: METAPLEX_AGENT_IDENTITY_PROGRAM_ID.toBase58(),
  };
}

export function cpegAgentRootToRendererParams(link: CpegAgentRootLink) {
  if (link.identityMode !== CPEG_IDENTITY_MODE_METAPLEX_AGENT || !link.agentAssetAddress) {
    return {};
  }
  return {
    identityMode: link.identityMode,
    canonicalRoot: link.canonicalRoot,
    agentAsset: link.agentAssetAddress,
    agentIdentity: link.agentIdentityPda,
    agentCollection: link.agentCollectionAddress,
    agentWallet: link.agentWalletAddress,
    agentRegistry: link.registryProgramId,
  };
}

export function cpegAgentRootToTokenMetadata(link: CpegAgentRootLink): Array<[string, string]> {
  if (link.identityMode !== CPEG_IDENTITY_MODE_METAPLEX_AGENT || !link.agentAssetAddress) {
    return [];
  }
  const entries: Array<[string, string]> = [
    ["identity_mode", link.identityMode],
    ["canonical_root", link.canonicalRoot],
    ["agent_asset", link.agentAssetAddress],
    ["agent_identity_pda", link.agentIdentityPda || ""],
    ["agent_collection", link.agentCollectionAddress || ""],
    ["agent_wallet", link.agentWalletAddress || ""],
    ["agent_registry_program", link.registryProgramId || ""],
  ];
  return entries.filter(([, value]) => value.length > 0);
}
