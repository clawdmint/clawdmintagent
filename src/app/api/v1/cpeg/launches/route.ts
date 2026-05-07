import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  CLAWPEG_DEFAULT_RENDERER_ID,
  CLAWPEG_DEFAULT_RENDERER_VERSION,
  CLAWPEG_FIXED_CREATOR_ROYALTY_BPS,
  CLAWPEG_MAX_SUPPLY_PER_COLLECTION,
  buildClawPegLaunchManifest,
  buildClawPegToken2022MintSetupManifest,
  createCollectionSeed,
  createRendererHash,
  getClawPegFeeVaultAddress,
  getClawPegToken2022MintAccountSize,
  quoteClawPegLaunchFee,
} from "@/lib/clawpeg";
import {
  CPEG_IDENTITY_MODE_METAPLEX_AGENT,
  cpegAgentRootToRendererParams,
  cpegAgentRootToTokenMetadata,
  normalizeCpegAgentRootLink,
} from "@/lib/cpeg-agent-root";

export const dynamic = "force-dynamic";

const ClawPegLaunchSchema = z.object({
  name: z.string().min(1).max(48),
  symbol: z.string().min(1).max(12).regex(/^[A-Z0-9]+$/),
  token_mint: z.string().min(32),
  authority_address: z.string().min(32),
  creator_address: z.string().min(32).optional(),
  max_pegs: z.number().int().min(1).max(CLAWPEG_MAX_SUPPLY_PER_COLLECTION),
  decimals: z.number().int().min(0).max(9).default(9),
  peg_unit_raw: z.string().regex(/^\d+$/).optional(),
  renderer_id: z.string().min(1).max(80).default(CLAWPEG_DEFAULT_RENDERER_ID),
  renderer_version: z.string().min(1).max(32).default(CLAWPEG_DEFAULT_RENDERER_VERSION),
  renderer_params: z.record(z.unknown()).optional(),
  collection_seed: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  royalty_bps: z.number().int().min(0).max(10000).optional(),
  marketplace_fee_bps: z.number().int().min(0).max(10000).optional(),
  premium_indexing: z.boolean().default(false),
  partner_api_enabled: z.boolean().default(false),
  white_label_domain: z.string().max(120).optional(),
  identity_mode: z.enum(["standalone", "metaplex_agent"]).default("standalone"),
  agent_asset_address: z.string().min(32).optional(),
  agent_identity_pda: z.string().min(32).optional(),
  agent_collection_address: z.string().min(32).optional(),
  agent_wallet_address: z.string().min(32).optional(),
  agent_name: z.string().max(80).optional(),
  include_token2022_setup: z.boolean().default(false),
  mint_authority_address: z.string().min(32).optional(),
  freeze_authority_address: z.string().min(32).nullable().optional(),
  mint_rent_lamports: z.string().regex(/^\d+$/).optional(),
  metadata_uri: z.string().url().optional(),
  persist: z.boolean().default(false),
});

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function pegUnitFromDecimals(decimals: number): bigint {
  return BigInt(`1${"0".repeat(decimals)}`);
}

function getCpegMetadataUri(tokenMint: string) {
  const base =
    process.env["NEXT_PUBLIC_CPEG_APP_URL"] ||
    "https://cpeg.clawdmint.xyz";
  return `${base.replace(/\/$/, "")}/api/cpeg/${tokenMint}/metadata`;
}

async function findAgent(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  return prisma.agent.findFirst({
    where: { hmacKeyHash: hashApiKey(apiKey) },
    select: {
      id: true,
      status: true,
      deployEnabled: true,
      solanaWalletAddress: true,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const agent = await findAgent(request);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid agent API key" },
        { status: 401 }
      );
    }

    if (agent.status !== "VERIFIED" || !agent.deployEnabled) {
      return NextResponse.json(
        { success: false, error: "Agent not verified for cPEG launches" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = ClawPegLaunchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    if (input.include_token2022_setup && !input.mint_rent_lamports) {
      return NextResponse.json(
        {
          success: false,
          error:
            "mint_rent_lamports is required when include_token2022_setup=true. Use getMinimumBalanceForRentExemption with the returned Token-2022 mint size, then retry.",
        },
        { status: 400 }
      );
    }
    const rendererParams = (input.renderer_params || {}) as Prisma.InputJsonObject;
    const agentRoot = normalizeCpegAgentRootLink({
      identityMode: input.identity_mode,
      agentAssetAddress: input.agent_asset_address,
      agentIdentityPda: input.agent_identity_pda,
      agentCollectionAddress: input.agent_collection_address,
      agentWalletAddress: input.agent_wallet_address,
      agentName: input.agent_name,
    });
    const linkedRendererParams = {
      ...(rendererParams as Record<string, unknown>),
      ...cpegAgentRootToRendererParams(agentRoot),
    } as Prisma.InputJsonObject;
    const metadataEntries = cpegAgentRootToTokenMetadata(agentRoot);
    const premiumIndexing = true;
    const fees = quoteClawPegLaunchFee({
      premiumIndexing,
      partnerApiEnabled: input.partner_api_enabled,
      whiteLabelDomain: input.white_label_domain,
    });
    const rendererHash = createRendererHash({
      id: input.renderer_id,
      version: input.renderer_version,
      params: linkedRendererParams,
    });
    const collectionSeed = input.collection_seed || createCollectionSeed();
    const creatorAddress = input.creator_address || agent.solanaWalletAddress || input.authority_address;
    const feeVault = getClawPegFeeVaultAddress() || input.authority_address;
    const royaltyBps = CLAWPEG_FIXED_CREATOR_ROYALTY_BPS;
    const marketplaceFeeBps = input.marketplace_fee_bps ?? fees.marketplaceFeeBps;
    const pegUnitRaw = BigInt(input.peg_unit_raw || pegUnitFromDecimals(input.decimals).toString());
    const metadataUri = input.metadata_uri || getCpegMetadataUri(input.token_mint);
    const token2022MintAccountSize = getClawPegToken2022MintAccountSize({
      mint: input.token_mint,
      updateAuthority: input.mint_authority_address || input.authority_address,
      name: input.name,
      symbol: input.symbol,
      metadataUri,
      additionalMetadata: metadataEntries,
    });

    const manifest = buildClawPegLaunchManifest({
      authority: input.authority_address,
      tokenMint: input.token_mint,
      creatorAddress,
      feeVaultAddress: feeVault,
      rendererHash,
      collectionSeed,
      pegUnitRaw,
      maxPegs: input.max_pegs,
      decimals: input.decimals,
      royaltyBps,
      marketplaceFeeBps,
      launchFeeLamports: BigInt(fees.totalLamports),
      premiumIndexing,
    });
    const token2022Setup =
      input.include_token2022_setup && input.mint_rent_lamports
        ? buildClawPegToken2022MintSetupManifest({
            payer: input.authority_address,
            mint: input.token_mint,
            mintAuthority: input.mint_authority_address || input.authority_address,
            freezeAuthority: input.freeze_authority_address,
            decimals: input.decimals,
            rentLamports: input.mint_rent_lamports,
            name: input.name,
            symbol: input.symbol,
            metadataUri,
            additionalMetadata: metadataEntries,
          })
        : null;

    let launchId: string | null = null;
    if (input.persist) {
      const saved = await prisma.clawPegLaunch.create({
        data: {
          agentId: agent.id,
          name: input.name,
          symbol: input.symbol,
          tokenMint: input.token_mint,
          collectionAddress: manifest.collection_address,
          hookValidationAddress: manifest.hook_validation_address,
          hookProgramId: manifest.program_id,
          chain: manifest.chain,
          cluster: manifest.cluster,
          rendererId: input.renderer_id,
          rendererVersion: input.renderer_version,
          rendererHash,
          collectionSeed,
          rendererParams: linkedRendererParams,
          identityMode: agentRoot.identityMode,
          canonicalRoot: agentRoot.canonicalRoot,
          agentAssetAddress: agentRoot.agentAssetAddress,
          agentIdentityPda: agentRoot.agentIdentityPda,
          agentCollectionAddress: agentRoot.agentCollectionAddress,
          agentWalletAddress: agentRoot.agentWalletAddress,
          agentRegistryProgramId: agentRoot.registryProgramId,
          identityLink: agentRoot as unknown as Prisma.InputJsonValue,
          pegUnitRaw: pegUnitRaw.toString(),
          maxPegs: input.max_pegs,
          royaltyBps,
          marketplaceFeeBps,
          launchFeeLamports: fees.totalLamports,
          premiumIndexing,
          partnerApiEnabled: input.partner_api_enabled,
          whiteLabelDomain: input.white_label_domain,
          authorityAddress: input.authority_address,
          creatorAddress,
          feeVaultAddress: feeVault,
          status: "DRAFT",
        },
      });
      launchId = saved.id;
    }

    return NextResponse.json({
      success: true,
      launch: {
        id: launchId,
        name: input.name,
        symbol: input.symbol,
        token_mint: input.token_mint,
        token2022_mint_account_size: token2022MintAccountSize,
        metadata_uri: metadataUri,
        collection_address: manifest.collection_address,
        hook_validation_address: manifest.hook_validation_address,
        renderer_id: input.renderer_id,
        renderer_version: input.renderer_version,
        renderer_hash: rendererHash,
        collection_seed: collectionSeed,
        renderer_params: linkedRendererParams,
        peg_unit_raw: pegUnitRaw.toString(),
        max_pegs: input.max_pegs,
        royalty_bps: royaltyBps,
        marketplace_fee_bps: marketplaceFeeBps,
        premium_indexing: premiumIndexing,
        partner_api_enabled: input.partner_api_enabled,
        white_label_domain: input.white_label_domain || null,
        identity_mode: agentRoot.identityMode,
        canonical_root: agentRoot.canonicalRoot,
        agent_asset_address: agentRoot.agentAssetAddress,
        agent_identity_pda: agentRoot.agentIdentityPda,
        agent_collection_address: agentRoot.agentCollectionAddress,
        agent_wallet_address: agentRoot.agentWalletAddress,
        agent_registry_program_id: agentRoot.registryProgramId,
        metaplex_agent_native: agentRoot.identityMode === CPEG_IDENTITY_MODE_METAPLEX_AGENT,
      },
      fees,
      token2022_setup: token2022Setup,
      manifest,
      message: "cPEG launch manifest prepared. Sign and broadcast the returned instruction to initialize the on-chain PEG collection.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG launch";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const agent = await findAgent(request);
  if (!agent) {
    return NextResponse.json({ success: false, error: "Missing or invalid agent API key" }, { status: 401 });
  }

  const launches = await prisma.clawPegLaunch.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    success: true,
    launches: launches.map((launch) => ({
      id: launch.id,
      name: launch.name,
      symbol: launch.symbol,
      token_mint: launch.tokenMint,
      collection_address: launch.collectionAddress,
      hook_validation_address: launch.hookValidationAddress,
      status: launch.status,
      renderer_id: launch.rendererId,
      renderer_version: launch.rendererVersion,
      max_pegs: launch.maxPegs,
      created_at: launch.createdAt.toISOString(),
    })),
  });
}
