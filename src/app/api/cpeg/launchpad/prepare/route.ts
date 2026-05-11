import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CLAWPEG_DEFAULT_RENDERER_ID,
  CLAWPEG_DEFAULT_RENDERER_VERSION,
  CLAWPEG_FIXED_CREATOR_ROYALTY_BPS,
  CLAWPEG_MAX_SUPPLY_PER_COLLECTION,
  buildClawPegLaunchManifest,
  buildClawPegToken2022MintSetupManifest,
  createCollectionSeed,
  getClawPegCluster,
  getClawPegFeeVaultAddress,
  getClawPegProgramId,
  getClawPegToken2022CreateAccountSize,
  quoteClawPegLaunchFee,
} from "@/lib/clawpeg";
import {
  computeClawPegRendererHash,
  getClawPegRenderer,
} from "@/lib/clawpeg-renderer-registry";
import { getClawPegRpcUrl } from "@/lib/env";
import {
  CPEG_IDENTITY_MODE_METAPLEX_AGENT,
  cpegAgentRootToRendererParams,
  normalizeCpegAgentRootLink,
} from "@/lib/cpeg-agent-root";
import {
  CPEG_STANDARD_MODE_METAPLEX_HYBRID,
  buildCpegMetaplexHybridPlan,
} from "@/lib/cpeg-metaplex-hybrid";

export const dynamic = "force-dynamic";

const MIN_CPEG_PROGRAMDATA_LEN = 200_000;

const LaunchpadPrepareSchema = z.object({
  name: z.string().min(1).max(48),
  symbol: z.string().min(1).max(12).regex(/^[A-Z0-9]+$/),
  token_mint: z.string().min(32),
  authority_address: z.string().min(32),
  creator_address: z.string().min(32).optional(),
  fee_vault_address: z.string().min(32).optional(),
  max_pegs: z.number().int().min(1).max(CLAWPEG_MAX_SUPPLY_PER_COLLECTION),
  decimals: z.number().int().min(0).max(9).default(6),
  royalty_bps: z.number().int().min(0).max(10000).optional(),
  marketplace_fee_bps: z.number().int().min(0).max(10000).optional(),
  premium_indexing: z.boolean().default(false),
  partner_api_enabled: z.boolean().default(false),
  white_label_domain: z.string().max(120).optional(),
  standard_mode: z.enum(["custom_registry", "metaplex_hybrid"]).default("metaplex_hybrid"),
  agent_token_mint: z.string().min(32).optional(),
  identity_mode: z.enum(["standalone", "metaplex_agent"]).default("standalone"),
  agent_asset_address: z.string().min(32).optional(),
  agent_identity_pda: z.string().min(32).optional(),
  agent_collection_address: z.string().min(32).optional(),
  agent_wallet_address: z.string().min(32).optional(),
  agent_name: z.string().max(80).optional(),
  renderer_id: z.string().min(1).optional(),
  renderer_version: z.string().min(1).optional(),
  renderer_params: z.record(z.unknown()).optional(),
});

function assertPublicKey(value: string, label: string) {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a valid Solana address`);
  }
}

function pegUnitFromDecimals(decimals: number): bigint {
  return BigInt(`1${"0".repeat(decimals)}`);
}

async function resolvePegBackingUnitRaw(
  connection: InstanceType<typeof Connection>,
  mintAddress: string,
  maxPegs: number,
  fallbackDecimals: number
) {
  const fallback = pegUnitFromDecimals(fallbackDecimals);
  try {
    const mint = new PublicKey(mintAddress);
    const account = await connection.getAccountInfo(mint, "confirmed");
    if (!account) return fallback;
    const tokenProgramId = account.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mintInfo = await getMint(connection, mint, "confirmed", tokenProgramId);
    const cap = BigInt(Math.max(1, Math.min(CLAWPEG_MAX_SUPPLY_PER_COLLECTION, maxPegs)));
    const unit = mintInfo.supply / cap;
    return unit > BigInt(0) ? unit : fallback;
  } catch {
    return fallback;
  }
}

function getCpegMetadataUri(tokenMint: string) {
  const base =
    process.env["NEXT_PUBLIC_CPEG_APP_URL"] ||
    "https://cpeg.clawdmint.xyz";
  return `${base.replace(/\/$/, "")}/api/cpeg/${tokenMint}/metadata`;
}

async function getUpgradeableProgramDataLength(
  connection: InstanceType<typeof Connection>,
  programId: InstanceType<typeof PublicKey>
) {
  const programAccount = await connection.getAccountInfo(programId, "confirmed");
  if (!programAccount || !programAccount.executable) {
    return { executable: false, dataLength: 0 };
  }
  if (
    programAccount.owner.toBase58() !== "BPFLoaderUpgradeab1e11111111111111111111111" ||
    programAccount.data.length < 36
  ) {
    return { executable: true, dataLength: programAccount.data.length };
  }
  const programDataAddress = new PublicKey(Buffer.from(programAccount.data.subarray(4, 36)));
  const programData = await connection.getAccountInfo(programDataAddress, "confirmed");
  return { executable: true, dataLength: programData?.data.length || 0 };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = LaunchpadPrepareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    assertPublicKey(input.token_mint, "token_mint");
    if (input.agent_token_mint) assertPublicKey(input.agent_token_mint, "agent_token_mint");
    assertPublicKey(input.authority_address, "authority_address");
    if (input.creator_address) assertPublicKey(input.creator_address, "creator_address");
    if (input.fee_vault_address) assertPublicKey(input.fee_vault_address, "fee_vault_address");
    const agentRoot = normalizeCpegAgentRootLink({
      identityMode: input.identity_mode,
      agentAssetAddress: input.agent_asset_address,
      agentIdentityPda: input.agent_identity_pda,
      agentCollectionAddress: input.agent_collection_address,
      agentWalletAddress: input.agent_wallet_address,
      agentName: input.agent_name,
    });

    const premiumIndexing = true;
    const royaltyBps = CLAWPEG_FIXED_CREATOR_ROYALTY_BPS;
    const fees = quoteClawPegLaunchFee({
      premiumIndexing,
      partnerApiEnabled: input.partner_api_enabled,
      whiteLabelDomain: input.white_label_domain,
    });
    const metadataUri = getCpegMetadataUri(input.token_mint);
    const mintAccountSize = getClawPegToken2022CreateAccountSize(false);
    const connection = new Connection(getClawPegRpcUrl(), "confirmed");
    const rendererId = input.renderer_id || CLAWPEG_DEFAULT_RENDERER_ID;
    const rendererVersion = input.renderer_version || CLAWPEG_DEFAULT_RENDERER_VERSION;
    const rendererManifest = getClawPegRenderer(rendererId, rendererVersion);
    if (!rendererManifest) {
      return NextResponse.json(
        { success: false, error: `Unknown renderer ${rendererId}@${rendererVersion}` },
        { status: 400 }
      );
    }
    const rendererParams: Record<string, unknown> = {
      ...rendererManifest.defaultParams,
      ...(input.renderer_params || {}),
      ...cpegAgentRootToRendererParams(agentRoot),
    };
    for (const field of rendererManifest.fields) {
      const value = rendererParams[field.key];
      if (typeof value !== "string") {
        return NextResponse.json(
          { success: false, error: `renderer_params.${field.key} is required` },
          { status: 400 }
        );
      }
      if (!field.options.some((option) => option.value === value)) {
        return NextResponse.json(
          { success: false, error: `renderer_params.${field.key} = ${value} is not a valid option` },
          { status: 400 }
        );
      }
    }
    if (rendererVersion === CLAWPEG_DEFAULT_RENDERER_VERSION && rendererId === CLAWPEG_DEFAULT_RENDERER_ID) {
      rendererParams.accessory = "auto";
      rendererParams.background = "auto";
    }
    const rendererHash = computeClawPegRendererHash({
      id: rendererId,
      version: rendererVersion,
      params: rendererParams,
    });
    const collectionSeed = createCollectionSeed();
    const creatorAddress = input.creator_address || input.authority_address;
    const feeVaultAddress = input.fee_vault_address || getClawPegFeeVaultAddress() || input.authority_address;
    const marketplaceFeeBps = input.marketplace_fee_bps ?? fees.marketplaceFeeBps;
    let pegUnitRaw = pegUnitFromDecimals(input.decimals).toString();

    if (input.standard_mode === CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      if (agentRoot.identityMode !== CPEG_IDENTITY_MODE_METAPLEX_AGENT || !agentRoot.agentAssetAddress || !agentRoot.agentIdentityPda) {
        return NextResponse.json(
          {
            success: false,
            error: "Metaplex Agent/Core root is required for Metaplex-native cPEG launches.",
          },
          { status: 400 }
        );
      }
      const agentTokenMint = input.agent_token_mint || input.token_mint;
      assertPublicKey(agentTokenMint, "agent_token_mint");
      pegUnitRaw = (await resolvePegBackingUnitRaw(connection, agentTokenMint, input.max_pegs, input.decimals)).toString();
      const identityAccounts = await connection.getMultipleAccountsInfo(
        [new PublicKey(agentRoot.agentAssetAddress), new PublicKey(agentRoot.agentIdentityPda)],
        "confirmed"
      );
      if (!identityAccounts[0] || !identityAccounts[1]) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Metaplex Agent/Core root is not confirmed on the configured cluster. Register the agent identity first, then launch cPEG.",
          },
          { status: 409 }
        );
      }

      const hybridPlan = buildCpegMetaplexHybridPlan({
        name: input.name,
        symbol: input.symbol,
        tokenMint: agentTokenMint,
        agentAssetAddress: agentRoot.agentAssetAddress,
        agentIdentityPda: agentRoot.agentIdentityPda,
        agentCollectionAddress: agentRoot.agentCollectionAddress,
        agentWalletAddress: agentRoot.agentWalletAddress,
        rendererHash,
        rendererId,
        rendererVersion,
        collectionSeed,
        pegUnitRaw,
        maxPegs: input.max_pegs,
        royaltyBps,
        marketplaceFeeBps,
        launchFeeLamports: fees.totalLamports,
      });

      return NextResponse.json({
        success: true,
        requires_signature: false,
        standard_mode: CPEG_STANDARD_MODE_METAPLEX_HYBRID,
        launch: {
          name: input.name,
          symbol: input.symbol,
          cluster: getClawPegCluster(),
          token_mint: agentTokenMint,
          collection_address: agentRoot.agentCollectionAddress,
          hook_validation_address: null,
          renderer_id: rendererId,
          renderer_version: rendererVersion,
          renderer_hash: rendererHash,
          collection_seed: collectionSeed,
          renderer_params: rendererParams,
          peg_unit_raw: pegUnitRaw,
          max_pegs: input.max_pegs,
          royalty_bps: royaltyBps,
          marketplace_fee_bps: marketplaceFeeBps,
          launch_fee_lamports: fees.totalLamports,
          premium_indexing: premiumIndexing,
          metadata_uri: metadataUri,
          standard_mode: CPEG_STANDARD_MODE_METAPLEX_HYBRID,
          identity_mode: agentRoot.identityMode,
          canonical_root: agentRoot.canonicalRoot,
          agent_asset_address: agentRoot.agentAssetAddress,
          agent_identity_pda: agentRoot.agentIdentityPda,
          agent_collection_address: agentRoot.agentCollectionAddress,
          agent_wallet_address: agentRoot.agentWalletAddress,
          agent_registry_program_id: agentRoot.registryProgramId,
          agent_token_mint: agentTokenMint,
          hybrid_program_id: hybridPlan.hybrid_program_id,
          hybrid_escrow_address: hybridPlan.escrow_address,
          hybrid_core_collection_address: hybridPlan.core_collection_address,
          hybrid_asset_collection_address: hybridPlan.core_collection_address,
          hybrid_swap_amount_raw: pegUnitRaw,
          hybrid_capture_fee_lamports: fees.totalLamports,
          hybrid_reroll: true,
          hybrid_status: hybridPlan.hybrid_status,
          hybrid_plan: hybridPlan,
        },
        fees,
        hybrid_setup: hybridPlan,
        message:
          "Metaplex-native cPEG launch prepared. Confirm to save the Hybrid setup plan for this Agent token.",
      });
    }

    // Pre-flight sanity check: confirm the configured cPEG program is actually deployed
    // and executable on the resolved cluster. This avoids opaque "program error" messages
    // when CLAWPEG_PROGRAM_ID points to a program that has not been deployed on the
    // active cluster (a common mainnet/devnet config drift). The program id is intentionally
    // omitted from the response message to avoid leaking deployment metadata to the client.
    let resolvedProgramId: InstanceType<typeof PublicKey>;
    try {
      resolvedProgramId = getClawPegProgramId();
    } catch {
      return NextResponse.json(
        { success: false, error: "cPEG program is not configured on the server." },
        { status: 503 }
      );
    }
    const programDeployment = await getUpgradeableProgramDataLength(connection, resolvedProgramId);
    if (!programDeployment.executable) {
      const cluster = getClawPegCluster();
      return NextResponse.json(
        {
          success: false,
          error: `cPEG program is not deployed on ${cluster}. Deploy the clawpeg program to this cluster or update the configured cluster.`,
        },
        { status: 503 }
      );
    }
    if (programDeployment.dataLength > 0 && programDeployment.dataLength < MIN_CPEG_PROGRAMDATA_LEN) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The configured cPEG program on this cluster has not been upgraded to the current cPEG build. Upgrade the program before launching.",
        },
        { status: 503 }
      );
    }
    if (agentRoot.identityMode === CPEG_IDENTITY_MODE_METAPLEX_AGENT) {
      const identityAccounts = await connection.getMultipleAccountsInfo(
        [
          new PublicKey(agentRoot.agentAssetAddress as string),
          new PublicKey(agentRoot.agentIdentityPda as string),
        ],
        "confirmed"
      );
      if (!identityAccounts[0] || !identityAccounts[1]) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Metaplex Agent/Core root is not confirmed on the configured cluster. Register the agent identity first, then launch cPEG.",
          },
          { status: 409 }
        );
      }
    }

    const mintRentLamports = await connection.getMinimumBalanceForRentExemption(mintAccountSize);

    const token2022Setup = buildClawPegToken2022MintSetupManifest({
      payer: input.authority_address,
      mint: input.token_mint,
      mintAuthority: input.authority_address,
      freezeAuthority: input.authority_address,
      decimals: input.decimals,
      rentLamports: mintRentLamports,
    });
    const manifest = buildClawPegLaunchManifest({
      authority: input.authority_address,
      tokenMint: input.token_mint,
      creatorAddress,
      feeVaultAddress,
      rendererHash,
      collectionSeed,
      pegUnitRaw: pegUnitFromDecimals(input.decimals),
      maxPegs: input.max_pegs,
      decimals: input.decimals,
      royaltyBps,
      marketplaceFeeBps,
      launchFeeLamports: BigInt(fees.totalLamports),
      premiumIndexing,
    });

    return NextResponse.json({
      success: true,
      launch: {
        name: input.name,
        symbol: input.symbol,
        token_mint: input.token_mint,
        collection_address: manifest.collection_address,
        hook_validation_address: manifest.hook_validation_address,
        renderer_id: rendererId,
        renderer_version: rendererVersion,
        renderer_hash: rendererHash,
      collection_seed: collectionSeed,
      renderer_params: rendererParams,
        peg_unit_raw: pegUnitRaw,
        max_pegs: input.max_pegs,
        royalty_bps: royaltyBps,
        marketplace_fee_bps: marketplaceFeeBps,
        premium_indexing: premiumIndexing,
        metadata_uri: metadataUri,
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
      message: "Launch transaction prepared. The client must partial-sign with the generated mint keypair and then request the connected wallet signature.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG launch";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
