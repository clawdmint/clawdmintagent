import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getMetadataPointerState,
  getMint,
  getTransferHook,
} from "@solana/spl-token";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findClawPegCollectionAddress, findClawPegHookValidationAddress, getClawPegProgramId } from "@/lib/clawpeg";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  let mint: InstanceType<typeof PublicKey>;
  try {
    mint = new PublicKey(params.mint);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid mint" }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      name: true,
      symbol: true,
      tokenMint: true,
      collectionAddress: true,
      hookValidationAddress: true,
      cluster: true,
      maxPegs: true,
      pegUnitRaw: true,
    },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const programId = getClawPegProgramId();
  const account = await connection.getAccountInfo(mint, "confirmed");
  if (!account) {
    return NextResponse.json({ success: false, error: "Mint not found on-chain" }, { status: 404 });
  }

  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const hook = getTransferHook(mintInfo);
  const metadataPointer = getMetadataPointerState(mintInfo);
  const collection = findClawPegCollectionAddress(params.mint);
  const validation = findClawPegHookValidationAddress(params.mint);
  const [collectionInfo, validationInfo] = await connection.getMultipleAccountsInfo([collection, validation], "confirmed");
  const isMainnet = launch.cluster === "mainnet-beta" || launch.cluster === "mainnet";
  const hookMatchesProgram = hook?.programId?.equals(programId) || false;
  const hasTransferHook = Boolean(hook?.programId);
  const hasHookAuthority = Boolean(hook?.authority);
  const hasFreezeAuthority = Boolean(mintInfo.freezeAuthority);
  const isToken2022 = account.owner.equals(TOKEN_2022_PROGRAM_ID);

  const orcaReady =
    isMainnet && isToken2022 && hookMatchesProgram && Boolean(collectionInfo) && Boolean(validationInfo) && !hasFreezeAuthority;
  const meteoraPermissionless =
    isMainnet && isToken2022 && hookMatchesProgram && Boolean(collectionInfo) && Boolean(validationInfo) && !hasHookAuthority;

  return NextResponse.json({
    success: true,
    collection: {
      name: launch.name,
      symbol: launch.symbol,
      mint: launch.tokenMint,
      cluster: launch.cluster,
      max_pegs: launch.maxPegs,
      peg_unit_raw: launch.pegUnitRaw,
      collection_pda: collection.toBase58(),
      validation_pda: validation.toBase58(),
      collection_exists: Boolean(collectionInfo),
      validation_exists: Boolean(validationInfo),
    },
    token: {
      is_token_2022: isToken2022,
      account_owner: account.owner.toBase58(),
      supply_raw: mintInfo.supply.toString(),
      decimals: mintInfo.decimals,
      mint_authority: mintInfo.mintAuthority?.toBase58() || null,
      freeze_authority: mintInfo.freezeAuthority?.toBase58() || null,
      metadata_pointer_authority: metadataPointer?.authority?.toBase58() || null,
      metadata_address: metadataPointer?.metadataAddress?.toBase58() || null,
    },
    hook: {
      program_id: hook?.programId?.toBase58() || null,
      authority: hook?.authority?.toBase58() || null,
      matches_cpeg_program: hookMatchesProgram,
      validation_data_length: validationInfo?.data.length || 0,
    },
    dex: {
      devnet_pool_test: {
        available: false,
        reason: isMainnet
          ? "This collection is on mainnet. Use the production DEX checks."
          : "Public aggregators do not reliably index devnet Token-2022 TransferHook pools.",
      },
      orca: {
        candidate: orcaReady,
        status: orcaReady ? "candidate_with_token_badge" : "needs_review",
        requirement:
          "Orca Whirlpools supports Token-2022 TransferHook through V2 instructions, but TransferHook mints require a TokenBadge and remaining accounts.",
        blockers: [
          ...(isMainnet ? [] : ["devnet_not_indexed"]),
          ...(isToken2022 ? [] : ["not_token_2022"]),
          ...(hookMatchesProgram ? [] : ["hook_not_cpeg_program"]),
          ...(collectionInfo ? [] : ["missing_collection_pda"]),
          ...(validationInfo ? [] : ["missing_validation_pda"]),
          ...(hasFreezeAuthority ? ["freeze_authority_requires_token_badge"] : []),
        ],
      },
      meteora: {
        candidate: meteoraPermissionless,
        status: meteoraPermissionless ? "permissionless_candidate" : "needs_token_badge_or_authority_revoke",
        requirement:
          "Meteora DLMM can use TransferHook permissionlessly only when the hook program and hook authority are revoked; otherwise token_badge review is required.",
        blockers: [
          ...(isMainnet ? [] : ["devnet_not_indexed"]),
          ...(isToken2022 ? [] : ["not_token_2022"]),
          ...(hookMatchesProgram ? [] : ["hook_not_cpeg_program"]),
          ...(hasHookAuthority ? ["hook_authority_active"] : []),
          ...(collectionInfo ? [] : ["missing_collection_pda"]),
          ...(validationInfo ? [] : ["missing_validation_pda"]),
        ],
      },
      official_router: {
        available: isMainnet,
        mode: "swap_then_assign_peg",
        prepare_endpoint: `/api/cpeg/${params.mint}/dex/jupiter/prepare`,
        reason: isMainnet
          ? "The official cPEG route can append PEG assignment after the external swap."
          : "Jupiter routes are not available for this devnet mint.",
      },
    },
    references: {
      solana_transfer_hook: "https://www.solana-program.com/docs/transfer-hook-interface",
      orca_token_extensions: "https://docs.orca.so/developers/architecture/token-extensions",
      meteora_token_2022: "https://docs.meteora.ag/overview/products/dlmm/token-2022-extensions",
    },
  });
}
