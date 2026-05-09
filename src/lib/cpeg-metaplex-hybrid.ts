import { PublicKey } from "@solana/web3.js";
import { MPL_HYBRID_PROGRAM_ID, deriveMplHybridEscrowPda } from "@/lib/mpl-hybrid-native";

export const CPEG_STANDARD_MODE_CUSTOM_REGISTRY = "custom_registry";
export const CPEG_STANDARD_MODE_METAPLEX_HYBRID = "metaplex_hybrid";
export const CPEG_HYBRID_STATUS_READY = "READY_FOR_HYBRID_SETUP";
export const CPEG_HYBRID_STATUS_CONFIGURED = "HYBRID_CONFIGURED";

export type CpegStandardMode =
  | typeof CPEG_STANDARD_MODE_CUSTOM_REGISTRY
  | typeof CPEG_STANDARD_MODE_METAPLEX_HYBRID;

export interface CpegMetaplexHybridPlanInput {
  name: string;
  symbol: string;
  tokenMint: string;
  agentAssetAddress: string;
  agentIdentityPda: string;
  agentCollectionAddress?: string | null;
  agentWalletAddress?: string | null;
  rendererHash: string;
  rendererId: string;
  rendererVersion: string;
  collectionSeed: string;
  pegUnitRaw: string;
  maxPegs: number;
  royaltyBps: number;
  marketplaceFeeBps: number;
  launchFeeLamports: string;
}

function parsePublicKey(value: string | null | undefined, label: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  try {
    return new PublicKey(trimmed).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address`);
  }
}

export function getConfiguredMplHybridProgramId() {
  return parsePublicKey(
    process.env["MPL_HYBRID_PROGRAM_ID"] ||
      process.env["NEXT_PUBLIC_MPL_HYBRID_PROGRAM_ID"] ||
      MPL_HYBRID_PROGRAM_ID.toBase58(),
    "MPL_HYBRID_PROGRAM_ID"
  );
}

export function deriveMplHybridEscrowAddress(collectionAddress: string | null | undefined) {
  const programId = getConfiguredMplHybridProgramId();
  const collection = parsePublicKey(collectionAddress, "core_collection_address");
  if (!programId || !collection) return null;
  return deriveMplHybridEscrowPda(collection, programId).toBase58();
}

export function buildCpegMetaplexHybridPlan(input: CpegMetaplexHybridPlanInput) {
  const tokenMint = parsePublicKey(input.tokenMint, "token_mint");
  const agentAssetAddress = parsePublicKey(input.agentAssetAddress, "agent_asset_address");
  const agentIdentityPda = parsePublicKey(input.agentIdentityPda, "agent_identity_pda");
  const agentCollectionAddress = parsePublicKey(input.agentCollectionAddress, "agent_collection_address");
  const agentWalletAddress = parsePublicKey(input.agentWalletAddress, "agent_wallet_address");
  const hybridProgramId = getConfiguredMplHybridProgramId();
  const escrowAddress = deriveMplHybridEscrowAddress(agentCollectionAddress);

  return {
    standard_mode: CPEG_STANDARD_MODE_METAPLEX_HYBRID,
    hybrid_status: CPEG_HYBRID_STATUS_READY,
    custody_model: "metaplex_hybrid_escrow_pda",
    hybrid_program_id: hybridProgramId,
    token_mint: tokenMint,
    agent_token_mint: tokenMint,
    agent_asset_address: agentAssetAddress,
    agent_identity_pda: agentIdentityPda,
    agent_collection_address: agentCollectionAddress,
    agent_wallet_address: agentWalletAddress,
    core_collection_address: agentCollectionAddress,
    escrow_address: escrowAddress,
    escrow_derivation: {
      program_id: hybridProgramId,
      seeds: ["escrow", "core_collection_address"],
      owner: "mpl_hybrid",
    },
    capture_release: {
      token_amount_raw: input.pegUnitRaw,
      reroll_on_release: true,
      capture_fee_lamports: input.launchFeeLamports,
      royalty_bps: input.royaltyBps,
      marketplace_fee_bps: input.marketplaceFeeBps,
    },
    renderer: {
      id: input.rendererId,
      version: input.rendererVersion,
      hash: input.rendererHash,
      collection_seed: input.collectionSeed,
    },
    limits: {
      max_pegs: input.maxPegs,
      whole_unit_raw: input.pegUnitRaw,
    },
    next_steps: [
      "Create or select the Core PEG collection for this agent root.",
      "Create the Metaplex Hybrid escrow PDA for the Core collection and agent token.",
      "Fund the escrow with deterministic Agent PEG Core assets or the fixed token backing pool.",
      "Open Get cPEG and Release so each fixed agent-token backing unit can resolve into one Agent PEG identity.",
      "Open the exact-identity market after the escrow is ready.",
    ],
  };
}
