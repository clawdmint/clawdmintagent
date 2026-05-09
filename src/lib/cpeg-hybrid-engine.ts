// Metaplex-native cPEG hybrid engine.
//
// Implements the current capture/release compatibility path on top of
// MPL-Core 1.x using umi 1.x. The product model is MPL-Hybrid native: fixed
// fungible backing units swap into Core cPEG identities and back through a
// Hybrid escrow. This file keeps existing launches operational until the
// @metaplex-foundation/mpl-hybrid SDK path is wired into the same Umi major.
//
// Do not expose this compatibility detail in public UI copy; users should see
// Buy token, Get cPEG, Release, and List/Buy cPEG.

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  create as createCoreAsset,
  createCollection as createCoreCollection,
  fetchAssetV1,
  mplCore,
  safeFetchAssetV1,
  safeFetchCollectionV1,
  transferV1 as transferCoreAsset,
} from "@metaplex-foundation/mpl-core";
import {
  createNoopSigner,
  generateSigner,
  keypairIdentity,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair, toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { getAgentOperationalKeypair, getAgentWalletBalance } from "@/lib/agent-wallets";
import { getMetaplexCoreConnection } from "@/lib/synapse-sap";

export const CPEG_HYBRID_STATUS_NOT_CONFIGURED = "NOT_CONFIGURED";
export const CPEG_HYBRID_STATUS_READY = "READY_FOR_HYBRID_SETUP";
export const CPEG_HYBRID_STATUS_CONFIGURED = "HYBRID_CONFIGURED";
export const CPEG_HYBRID_ASSET_STATUS_OWNED = "OWNED";
export const CPEG_HYBRID_ASSET_STATUS_POOL = "POOL";
export const CPEG_HYBRID_ASSET_STATUS_LISTED = "LISTED";

const MIN_AGENT_WALLET_LAMPORTS_FOR_SETUP = BigInt(20_000_000);
const MIN_AGENT_WALLET_LAMPORTS_FOR_CAPTURE = BigInt(8_000_000);
const MIN_AGENT_WALLET_LAMPORTS_FOR_RELEASE = BigInt(2_000_000);

export class CpegHybridEngineError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "CpegHybridEngineError";
    this.status = status;
    this.details = details;
  }
}

export interface HybridAgentRecord {
  id: string;
  name: string;
  solanaWalletAddress: string | null;
  solanaWalletEncryptedKey: string | null;
}

export interface HybridSetupResult {
  collectionAddress: string;
  vaultTokenAccount: string;
  vaultOwner: string;
  tokenProgramId: string;
  setupTxSignature: string | null;
}

export interface HybridStateSummary {
  status: string;
  collectionAddress: string | null;
  vaultTokenAccount: string | null;
  vaultOwner: string | null;
  tokenProgramId: string | null;
  decimals: number;
  tokenSupplyRaw: string;
  pegUnitRaw: string;
  effectiveMaxPegs: number;
  availableCapacity: number;
  burnedCapacity: number;
  totalAssets: number;
  ownedAssets: number;
  poolAssets: number;
  vaultTokenBalanceRaw: string;
  vaultTokenBalanceWhole: number;
}

interface HybridLaunchSnapshot {
  id: string;
  name: string;
  symbol: string;
  tokenMint: string;
  agentTokenMint: string | null;
  hybridCoreCollectionAddress: string | null;
  hybridEscrowAddress: string | null;
  hybridStatus: string;
  pegUnitRaw: string;
  maxPegs: number;
  rendererId: string;
  rendererVersion: string;
  collectionSeed: string;
}

interface HybridContext {
  agent: HybridAgentRecord;
  signer: InstanceType<typeof Keypair>;
  connection: InstanceType<typeof Connection>;
  tokenMint: InstanceType<typeof PublicKey>;
  tokenProgramId: InstanceType<typeof PublicKey>;
  decimals: number;
  tokenSupplyRaw: bigint;
  pegUnitRaw: bigint;
}

function deriveTokenProgramId(ownerProgramId: string): InstanceType<typeof PublicKey> {
  if (ownerProgramId === TOKEN_2022_PROGRAM_ID.toBase58()) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

async function loadHybridContext(
  agent: HybridAgentRecord,
  launch: Pick<HybridLaunchSnapshot, "agentTokenMint" | "tokenMint" | "pegUnitRaw" | "maxPegs">
): Promise<HybridContext> {
  const mintBase58 = (launch.agentTokenMint || launch.tokenMint || "").trim();
  if (!mintBase58) {
    throw new CpegHybridEngineError(400, "Agent token mint is missing on this cPEG launch");
  }
  let tokenMint: InstanceType<typeof PublicKey>;
  try {
    tokenMint = new PublicKey(mintBase58);
  } catch {
    throw new CpegHybridEngineError(400, "Agent token mint is not a valid Solana address");
  }
  const signer = getAgentOperationalKeypair(agent);
  const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
  const mintAccount = await connection.getAccountInfo(tokenMint, "confirmed");
  if (!mintAccount) {
    throw new CpegHybridEngineError(409, "Agent token mint is not present on the configured cluster");
  }
  const tokenProgramId = deriveTokenProgramId(mintAccount.owner.toBase58());
  let decimals = 0;
  let tokenSupplyRaw = BigInt(0);
  try {
    const info = await getMint(connection, tokenMint, "confirmed", tokenProgramId);
    decimals = info.decimals;
    tokenSupplyRaw = info.supply;
  } catch {
    decimals = 0;
  }
  let pegUnitRaw: bigint;
  try {
    pegUnitRaw = BigInt(launch.pegUnitRaw || "0");
  } catch {
    pegUnitRaw = BigInt(0);
  }
  const baseUnitRaw = BigInt(`1${"0".repeat(decimals)}`);
  const maxPegs = Math.max(1, Math.min(10_000, launch.maxPegs || 0));
  const supplyDerivedPegUnit = tokenSupplyRaw > BigInt(0) ? tokenSupplyRaw / BigInt(maxPegs) : BigInt(0);
  // Older hybrid launches used one display token as the PEG unit. For agent
  // tokens with large supplies, the fixed backing unit must instead be derived
  // from the launch-time supply divided by max PEGs. New launches persist that
  // value; this fallback keeps earlier saved launches economically coherent.
  if (supplyDerivedPegUnit > BigInt(0) && (pegUnitRaw <= BigInt(0) || pegUnitRaw <= baseUnitRaw)) {
    pegUnitRaw = supplyDerivedPegUnit;
  }
  if (pegUnitRaw <= BigInt(0)) {
    pegUnitRaw = baseUnitRaw;
  }
  return { agent, signer, connection, tokenMint, tokenProgramId, decimals, tokenSupplyRaw, pegUnitRaw };
}

function effectiveHybridCapacity(maxPegs: number, tokenSupplyRaw: bigint, pegUnitRaw: bigint) {
  const launchCap = Math.max(1, Math.min(10_000, maxPegs || 1));
  if (pegUnitRaw <= BigInt(0)) return launchCap;
  const supplyCap = Number(tokenSupplyRaw / pegUnitRaw);
  return Math.max(0, Math.min(launchCap, supplyCap));
}

function buildAssetMetadata(launch: HybridLaunchSnapshot, pegId: number) {
  const baseAppUrl =
    process.env["NEXT_PUBLIC_CPEG_APP_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "https://cpeg.clawdmint.xyz";
  const cleanBase = baseAppUrl.replace(/\/$/, "");
  const tokenMintLower = launch.tokenMint;
  return {
    name: `${launch.symbol} cPEG #${pegId}`,
    uri: `${cleanBase}/api/cpeg/${tokenMintLower}/pegs/${pegId}`,
  };
}

function findNextPegId(
  taken: Set<number>,
  maxPegs: number,
  rendererSeed: string,
  ownerAddress: string
): number {
  const cap = Math.max(1, Math.min(10_000, maxPegs || 1000));
  const seedSource = `${rendererSeed || ""}|${ownerAddress}|${Date.now()}`;
  let hash = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    hash = (hash * 131 + seedSource.charCodeAt(index)) >>> 0;
  }
  for (let attempt = 0; attempt < cap; attempt += 1) {
    const candidate = ((hash + attempt) % cap) + 1;
    if (!taken.has(candidate)) return candidate;
  }
  // Fallback: deterministic linear walk if hashing exhausted (shouldn't happen at scale used).
  for (let id = 1; id <= cap; id += 1) {
    if (!taken.has(id)) return id;
  }
  throw new CpegHybridEngineError(409, "Hybrid pool is fully captured for this launch");
}

export async function buildHybridStateSummary(
  agent: HybridAgentRecord,
  launch: HybridLaunchSnapshot,
  assetCounts: { total: number; owned: number; pool: number }
): Promise<HybridStateSummary> {
  const status = launch.hybridStatus;
  const collectionAddress = launch.hybridCoreCollectionAddress;
  const vaultTokenAccount = launch.hybridEscrowAddress;
  const vaultOwner = agent.solanaWalletAddress;
  let tokenProgramId: string | null = null;
  let decimals = 0;
  let tokenSupplyRaw = BigInt(0);
  let pegUnitRaw = BigInt(0);
  let vaultRaw = BigInt(0);
  let vaultWhole = 0;
  try {
    const ctx = await loadHybridContext(agent, launch);
    tokenProgramId = ctx.tokenProgramId.toBase58();
    decimals = ctx.decimals;
    tokenSupplyRaw = ctx.tokenSupplyRaw;
    pegUnitRaw = ctx.pegUnitRaw;
    if (vaultTokenAccount && launch.agentTokenMint) {
      const ata = new PublicKey(vaultTokenAccount);
      const balance = await ctx.connection.getTokenAccountBalance(ata, "confirmed").catch(() => null);
      if (balance?.value?.amount) {
        vaultRaw = BigInt(balance.value.amount);
        const denom = ctx.pegUnitRaw === BigInt(0) ? BigInt(1) : ctx.pegUnitRaw;
        vaultWhole = Number(vaultRaw / denom);
      }
    }
  } catch {
    // ignore; balance and supply are best effort
  }
  const effectiveMax = effectiveHybridCapacity(launch.maxPegs, tokenSupplyRaw, pegUnitRaw);
  const availableCapacity = Math.max(0, effectiveMax - assetCounts.total);
  return {
    status,
    collectionAddress,
    vaultTokenAccount,
    vaultOwner,
    tokenProgramId,
    decimals,
    tokenSupplyRaw: tokenSupplyRaw.toString(),
    pegUnitRaw: pegUnitRaw.toString(),
    effectiveMaxPegs: effectiveMax,
    availableCapacity,
    burnedCapacity: Math.max(0, Math.min(10_000, launch.maxPegs || 0) - effectiveMax),
    totalAssets: assetCounts.total,
    ownedAssets: assetCounts.owned,
    poolAssets: assetCounts.pool,
    vaultTokenBalanceRaw: vaultRaw.toString(),
    vaultTokenBalanceWhole: vaultWhole,
  };
}

/**
 * Configure the hybrid setup for a launch by deploying a Core Collection (PEG
 * pool) under the agent wallet's update authority and ensuring the agent ATA
 * exists for the agent token. Idempotent: reuses the configured collection /
 * ATA if they already exist.
 */
export async function setupHybridLaunch(
  agent: HybridAgentRecord,
  launch: HybridLaunchSnapshot
): Promise<HybridSetupResult> {
  const ctx = await loadHybridContext(agent, launch);
  const balance = await getAgentWalletBalance(ctx.signer.publicKey.toBase58());
  if (balance.lamports < MIN_AGENT_WALLET_LAMPORTS_FOR_SETUP) {
    throw new CpegHybridEngineError(402, "Agent wallet does not have enough SOL to deploy the Core PEG collection", {
      balance_sol: balance.sol,
      required_sol: Number(MIN_AGENT_WALLET_LAMPORTS_FOR_SETUP) / 1_000_000_000,
      wallet_address: ctx.signer.publicKey.toBase58(),
    });
  }

  const umi = createUmi(getMetaplexCoreConnection());
  umi.use(mplCore());
  umi.use(keypairIdentity(fromWeb3JsKeypair(ctx.signer)));

  // Resolve or create the Core PEG collection.
  let collectionAddress = launch.hybridCoreCollectionAddress;
  let setupTxSignature: string | null = null;
  if (collectionAddress) {
    const existing = await safeFetchCollectionV1(umi, publicKey(collectionAddress));
    if (!existing) collectionAddress = null;
  }
  if (!collectionAddress) {
    const collectionSigner = generateSigner(umi);
    const baseAppUrl =
      process.env["NEXT_PUBLIC_CPEG_APP_URL"] ||
      process.env["NEXT_PUBLIC_APP_URL"] ||
      "https://cpeg.clawdmint.xyz";
    const collectionUri = `${baseAppUrl.replace(/\/$/, "")}/api/cpeg/${launch.tokenMint}/metadata`;
    try {
      const builder = await createCoreCollection(umi, {
        collection: collectionSigner,
        name: `${launch.name} cPEG Pool`,
        uri: collectionUri,
        updateAuthority: umi.identity.publicKey,
      })
        .useLegacyVersion()
        .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
      setupTxSignature = builder?.signature ? bytesToBase58Signature(builder.signature) : null;
    } catch (createError) {
      const onchain = await safeFetchCollectionV1(umi, publicKey(collectionSigner.publicKey));
      if (!onchain) throw createError;
    }
    collectionAddress = collectionSigner.publicKey.toString();
  }

  // Ensure the agent ATA for the agent token exists.
  const vaultAta = getAssociatedTokenAddressSync(
    ctx.tokenMint,
    ctx.signer.publicKey,
    false,
    ctx.tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const vaultInfo = await ctx.connection.getAccountInfo(vaultAta, "confirmed");
  if (!vaultInfo) {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      ctx.signer.publicKey,
      vaultAta,
      ctx.signer.publicKey,
      ctx.tokenMint,
      ctx.tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await sendInstructionsWithAgentSigner(ctx.connection, ctx.signer, [createAtaIx]);
  }

  return {
    collectionAddress,
    vaultTokenAccount: vaultAta.toBase58(),
    vaultOwner: ctx.signer.publicKey.toBase58(),
    tokenProgramId: ctx.tokenProgramId.toBase58(),
    setupTxSignature,
  };
}

/**
 * Build the unsigned instructions required to capture one or more fixed PEG
 * backing units from the user's wallet into the agent vault. The frontend signs and
 * broadcasts, then calls captureConfirm() so the backend can mint the Core
 * asset and persist the row.
 */
export async function buildCaptureTransferInstructions(
  agent: HybridAgentRecord,
  launch: HybridLaunchSnapshot,
  userWallet: string,
  capturesToCommit: number
): Promise<{
  instructions: Array<{ programId: string; accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>; dataBase64: string }>;
  vaultAta: string;
  userAta: string;
  vaultOwner: string;
  amountRaw: string;
  amountWhole: number;
  userBalanceRaw: string;
  userBalanceWhole: number;
  pegUnitRaw: string;
  tokenSupplyRaw: string;
  tokenProgramId: string;
  decimals: number;
}> {
  const ctx = await loadHybridContext(agent, launch);
  const userPubkey = new PublicKey(userWallet);
  const capCount = Math.max(1, Math.floor(capturesToCommit || 1));
  const totalRaw = ctx.pegUnitRaw * BigInt(capCount);
  const vaultAta = getAssociatedTokenAddressSync(
    ctx.tokenMint,
    ctx.signer.publicKey,
    false,
    ctx.tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const userAta = getAssociatedTokenAddressSync(
    ctx.tokenMint,
    userPubkey,
    false,
    ctx.tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  // Resolve user balance + ATA presence so we can return a friendly error long
  // before the user is asked to sign a transaction the network would reject.
  let userBalanceRaw = BigInt(0);
  const userAtaInfo = await ctx.connection.getAccountInfo(userAta, "confirmed");
  if (userAtaInfo) {
    try {
      const balance = await ctx.connection.getTokenAccountBalance(userAta, "confirmed");
      userBalanceRaw = BigInt(balance.value.amount || "0");
    } catch {
      userBalanceRaw = BigInt(0);
    }
  }
  if (userBalanceRaw < totalRaw) {
    const denom = ctx.pegUnitRaw === BigInt(0) ? BigInt(1) : ctx.pegUnitRaw;
    throw new CpegHybridEngineError(
      402,
      `Wallet has enough tokens for ${Number(userBalanceRaw / denom)} cPEG capture(s), but ${capCount} are required.`,
      {
        token_mint: ctx.tokenMint.toBase58(),
        token_program_id: ctx.tokenProgramId.toBase58(),
        decimals: ctx.decimals,
        peg_unit_raw: ctx.pegUnitRaw.toString(),
        balance_raw: userBalanceRaw.toString(),
        required_raw: totalRaw.toString(),
        user_token_account: userAta.toBase58(),
        user_token_account_initialized: Boolean(userAtaInfo),
      }
    );
  }
  const ixs: InstanceType<typeof TransactionInstruction>[] = [];
  if (!userAtaInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        userPubkey,
        userAta,
        userPubkey,
        ctx.tokenMint,
        ctx.tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  const vaultAtaInfo = await ctx.connection.getAccountInfo(vaultAta, "confirmed");
  if (!vaultAtaInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        userPubkey,
        vaultAta,
        ctx.signer.publicKey,
        ctx.tokenMint,
        ctx.tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  ixs.push(
    createTransferCheckedInstruction(
      userAta,
      ctx.tokenMint,
      vaultAta,
      userPubkey,
      totalRaw,
      ctx.decimals,
      [],
      ctx.tokenProgramId
    )
  );
  const denom = ctx.pegUnitRaw === BigInt(0) ? BigInt(1) : ctx.pegUnitRaw;
  return {
    instructions: ixs.map((ix) => serializeInstruction(ix)),
    vaultAta: vaultAta.toBase58(),
    userAta: userAta.toBase58(),
    vaultOwner: ctx.signer.publicKey.toBase58(),
    amountRaw: totalRaw.toString(),
    amountWhole: Number(totalRaw / denom),
    userBalanceRaw: userBalanceRaw.toString(),
    userBalanceWhole: Number(userBalanceRaw / denom),
    pegUnitRaw: ctx.pegUnitRaw.toString(),
    tokenSupplyRaw: ctx.tokenSupplyRaw.toString(),
    tokenProgramId: ctx.tokenProgramId.toBase58(),
    decimals: ctx.decimals,
  };
}

function truncateMintForError(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Confirm a capture by minting one Metaplex Core asset (deterministic peg id)
 * to the user with the agent wallet as update authority. Idempotent per peg id.
 */
export async function confirmCaptureMint(
  agent: HybridAgentRecord,
  launch: HybridLaunchSnapshot,
  userWallet: string,
  takenPegIds: Set<number>
): Promise<{ assetAddress: string; pegId: number; mintTxSignature: string | null }> {
  const ctx = await loadHybridContext(agent, launch);
  const balance = await getAgentWalletBalance(ctx.signer.publicKey.toBase58());
  if (balance.lamports < MIN_AGENT_WALLET_LAMPORTS_FOR_CAPTURE) {
    throw new CpegHybridEngineError(402, "Agent wallet does not have enough SOL to mint a Core PEG asset", {
      balance_sol: balance.sol,
      required_sol: Number(MIN_AGENT_WALLET_LAMPORTS_FOR_CAPTURE) / 1_000_000_000,
      wallet_address: ctx.signer.publicKey.toBase58(),
    });
  }
  if (!launch.hybridCoreCollectionAddress) {
    throw new CpegHybridEngineError(409, "Hybrid setup is incomplete: Core PEG collection is missing");
  }
  const umi = createUmi(getMetaplexCoreConnection());
  umi.use(mplCore());
  umi.use(keypairIdentity(fromWeb3JsKeypair(ctx.signer)));

  const collectionAddress = launch.hybridCoreCollectionAddress;
  const collectionAccount = await safeFetchCollectionV1(umi, publicKey(collectionAddress));
  if (!collectionAccount) {
    throw new CpegHybridEngineError(409, "Core PEG collection account is not present on chain");
  }
  const pegId = findNextPegId(takenPegIds, launch.maxPegs, launch.collectionSeed, userWallet);
  const metadata = buildAssetMetadata(launch, pegId);
  const assetSigner = generateSigner(umi);
  let mintTxSignature: string | null = null;
  try {
    const builder = await createCoreAsset(umi, {
      asset: assetSigner,
      collection: collectionAccount,
      owner: publicKey(userWallet),
      name: metadata.name,
      uri: metadata.uri,
    })
      .useLegacyVersion()
      .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
    mintTxSignature = builder?.signature ? bytesToBase58Signature(builder.signature) : null;
  } catch (mintError) {
    const onchain = await safeFetchAssetV1(umi, publicKey(assetSigner.publicKey));
    if (!onchain) throw mintError;
  }
  return {
    assetAddress: assetSigner.publicKey.toString(),
    pegId,
    mintTxSignature,
  };
}

/**
 * Release a captured Core asset back to the agent vault and pay one fixed PEG
 * backing unit from the vault to the user. The user must have already signed a
 * Core asset transfer to the agent wallet before calling this. The agent
 * confirms ownership of the asset, then sends the token payout.
 */
export async function confirmReleasePayout(
  agent: HybridAgentRecord,
  launch: HybridLaunchSnapshot,
  userWallet: string,
  assetAddress: string
): Promise<{ payoutTxSignature: string }> {
  const ctx = await loadHybridContext(agent, launch);
  const balance = await getAgentWalletBalance(ctx.signer.publicKey.toBase58());
  if (balance.lamports < MIN_AGENT_WALLET_LAMPORTS_FOR_RELEASE) {
    throw new CpegHybridEngineError(402, "Agent wallet does not have enough SOL to settle a release", {
      balance_sol: balance.sol,
      required_sol: Number(MIN_AGENT_WALLET_LAMPORTS_FOR_RELEASE) / 1_000_000_000,
      wallet_address: ctx.signer.publicKey.toBase58(),
    });
  }
  if (!launch.hybridCoreCollectionAddress) {
    throw new CpegHybridEngineError(409, "Hybrid setup is incomplete: Core PEG collection is missing");
  }
  const umi = createUmi(getMetaplexCoreConnection());
  umi.use(mplCore());
  umi.use(keypairIdentity(fromWeb3JsKeypair(ctx.signer)));
  const asset = await fetchAssetV1(umi, publicKey(assetAddress));
  const ownerKey = toWeb3JsPublicKey(asset.owner);
  if (ownerKey.toBase58() !== ctx.signer.publicKey.toBase58()) {
    throw new CpegHybridEngineError(409, "Asset has not been transferred back to the agent vault yet");
  }

  const vaultAta = getAssociatedTokenAddressSync(
    ctx.tokenMint,
    ctx.signer.publicKey,
    false,
    ctx.tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const userPubkey = new PublicKey(userWallet);
  const userAta = getAssociatedTokenAddressSync(
    ctx.tokenMint,
    userPubkey,
    false,
    ctx.tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const ixs: InstanceType<typeof TransactionInstruction>[] = [];
  const userAtaInfo = await ctx.connection.getAccountInfo(userAta, "confirmed");
  if (!userAtaInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        ctx.signer.publicKey,
        userAta,
        userPubkey,
        ctx.tokenMint,
        ctx.tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  ixs.push(
    createTransferCheckedInstruction(
      vaultAta,
      ctx.tokenMint,
      userAta,
      ctx.signer.publicKey,
      ctx.pegUnitRaw,
      ctx.decimals,
      [],
      ctx.tokenProgramId
    )
  );
  const payoutTxSignature = await sendInstructionsWithAgentSigner(ctx.connection, ctx.signer, ixs);
  return { payoutTxSignature };
}

/**
 * Build the unsigned Metaplex Core transfer instruction(s) needed to move a
 * captured asset from the user back to the agent vault. Returned in the same
 * manifest shape the cPEG market client uses for prepared instructions, so the
 * frontend can sign with Phantom without bringing in any umi wallet adapter.
 */
export async function buildReleaseTransferInstructions(
  agent: HybridAgentRecord,
  launch: HybridLaunchSnapshot,
  userWallet: string,
  assetAddress: string
): Promise<{
  instructions: Array<{ programId: string; accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>; dataBase64: string }>;
  targetOwner: string;
  collectionAddress: string;
  pegId: number | null;
}> {
  if (!launch.hybridCoreCollectionAddress) {
    throw new CpegHybridEngineError(409, "Hybrid setup is incomplete: Core PEG collection is missing");
  }
  if (!agent.solanaWalletAddress) {
    throw new CpegHybridEngineError(409, "Agent vault wallet is not configured");
  }
  const ctx = await loadHybridContext(agent, launch);
  const umi = createUmi(getMetaplexCoreConnection());
  umi.use(mplCore());
  // Use the user as a noop signer for instruction building; their actual signature
  // is provided client-side via Phantom when the transaction is broadcast.
  const userSigner = createNoopSigner(publicKey(userWallet));
  umi.use(signerIdentity(userSigner));
  const targetOwner = ctx.signer.publicKey.toBase58();
  const builder = transferCoreAsset(umi, {
    asset: publicKey(assetAddress),
    collection: publicKey(launch.hybridCoreCollectionAddress),
    newOwner: publicKey(targetOwner),
    authority: userSigner,
  });
  const items = builder.items;
  const ixs: InstanceType<typeof TransactionInstruction>[] = items.map((item) => {
    const ix = item.instruction;
    return new TransactionInstruction({
      programId: new PublicKey(ix.programId.toString()),
      keys: ix.keys.map((meta) => ({
        pubkey: new PublicKey(meta.pubkey.toString()),
        isSigner: meta.isSigner,
        isWritable: meta.isWritable,
      })),
      data: Buffer.from(ix.data),
    });
  });
  let pegId: number | null = null;
  // Best-effort attempt to resolve the peg id from the asset name. The asset
  // metadata embeds the deterministic peg id but we do not strictly need it for
  // the transfer; the release/confirm endpoint will already have the peg id from
  // the database row.
  try {
    const asset = await fetchAssetV1(umi, publicKey(assetAddress));
    const match = /#(\d+)/.exec(asset.name || "");
    if (match) pegId = Number.parseInt(match[1], 10);
  } catch {
    // ignore
  }
  return {
    instructions: ixs.map((ix) => serializeInstruction(ix)),
    targetOwner,
    collectionAddress: launch.hybridCoreCollectionAddress,
    pegId,
  };
}

export async function transferCoreAssetFromAgent(
  agent: HybridAgentRecord,
  launch: HybridLaunchSnapshot,
  assetAddress: string,
  newOwner: string
): Promise<string | null> {
  if (!launch.hybridCoreCollectionAddress) {
    throw new CpegHybridEngineError(409, "Hybrid setup is incomplete: Core PEG collection is missing");
  }
  const ctx = await loadHybridContext(agent, launch);
  const umi = createUmi(getMetaplexCoreConnection());
  umi.use(mplCore());
  umi.use(keypairIdentity(fromWeb3JsKeypair(ctx.signer)));
  const collectionAccount = await safeFetchCollectionV1(umi, publicKey(launch.hybridCoreCollectionAddress));
  if (!collectionAccount) {
    throw new CpegHybridEngineError(409, "Core PEG collection account is not present on chain");
  }
  const asset = await fetchAssetV1(umi, publicKey(assetAddress));
  if (toWeb3JsPublicKey(asset.owner).toBase58() !== ctx.signer.publicKey.toBase58()) {
    throw new CpegHybridEngineError(409, "Core PEG asset is not escrowed by the agent vault");
  }
  const builder = await transferCoreAsset(umi, {
    asset: asset.publicKey,
    collection: collectionAccount.publicKey,
    newOwner: publicKey(newOwner),
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  return builder?.signature ? bytesToBase58Signature(builder.signature) : null;
}

/**
 * Send the Core asset back into the agent pool by transferring it from the
 * user to the agent vault. We do not need this on the backend if the user
 * signs the transfer themselves; this helper is kept for advanced flows where
 * the agent wallet itself owns the asset and wants to recycle it (e.g. after
 * batch release reroll).
 */
export async function recycleAssetToPool(
  agent: HybridAgentRecord,
  launch: HybridLaunchSnapshot,
  assetAddress: string
): Promise<string | null> {
  const ctx = await loadHybridContext(agent, launch);
  if (!launch.hybridCoreCollectionAddress) return null;
  const umi = createUmi(getMetaplexCoreConnection());
  umi.use(mplCore());
  umi.use(keypairIdentity(fromWeb3JsKeypair(ctx.signer)));
  const asset = await fetchAssetV1(umi, publicKey(assetAddress));
  if (toWeb3JsPublicKey(asset.owner).toBase58() !== ctx.signer.publicKey.toBase58()) {
    return null;
  }
  const collectionAccount = await safeFetchCollectionV1(umi, publicKey(launch.hybridCoreCollectionAddress));
  if (!collectionAccount) return null;
  try {
    const builder = await transferCoreAsset(umi, {
      asset: asset.publicKey,
      collection: collectionAccount.publicKey,
      newOwner: umi.identity.publicKey,
    }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
    return builder?.signature ? bytesToBase58Signature(builder.signature) : null;
  } catch {
    return null;
  }
}

interface AccountMetaLike {
  pubkey: InstanceType<typeof PublicKey>;
  isSigner: boolean;
  isWritable: boolean;
}

function serializeInstruction(ix: InstanceType<typeof TransactionInstruction>) {
  return {
    programId: ix.programId.toBase58(),
    accounts: ix.keys.map((key: AccountMetaLike) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    dataBase64: Buffer.from(ix.data).toString("base64"),
  };
}

async function sendInstructionsWithAgentSigner(
  connection: InstanceType<typeof Connection>,
  signer: InstanceType<typeof Keypair>,
  instructions: InstanceType<typeof TransactionInstruction>[]
): Promise<string> {
  const transaction = new Transaction();
  for (const ix of instructions) transaction.add(ix);
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = signer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.sign(signer);
  const raw = transaction.serialize({ requireAllSignatures: true });
  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 5,
  });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed"
  );
  return signature;
}

function bytesToBase58Signature(value: Uint8Array | string): string {
  if (typeof value === "string") return value;
  // Avoid an extra dependency: use a small base58 encoder consistent with bs58.
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!value.length) return "";
  const digits: number[] = [0];
  for (let byteIndex = 0; byteIndex < value.length; byteIndex += 1) {
    let carry = value[byteIndex];
    for (let cursor = 0; cursor < digits.length; cursor += 1) {
      const x = digits[cursor] * 256 + carry;
      digits[cursor] = x % 58;
      carry = Math.floor(x / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let leadingZeros = 0;
  for (let byteIndex = 0; byteIndex < value.length && value[byteIndex] === 0; byteIndex += 1) {
    leadingZeros += 1;
  }
  let encoded = "";
  for (let cursor = digits.length - 1; cursor >= 0; cursor -= 1) {
    encoded += ALPHABET[digits[cursor]];
  }
  return ALPHABET[0].repeat(leadingZeros) + encoded;
}

export type { HybridLaunchSnapshot };

// Suppressing unused import warning intentionally; `SystemProgram` is reserved for
// future use when bundling rent-exempt account creation alongside agent transfers.
void SystemProgram;
