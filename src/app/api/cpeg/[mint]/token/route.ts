import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint, getTokenMetadata } from "@solana/spl-token";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

/**
 * Surface the token side of a cPEG launch.
 *
 * The reason this endpoint exists is the user-facing PEG promise: every whole token-2022
 * unit on the mint is bound to a discrete on-chain identity, and the authority cannot
 * silently print more units once the supply is sealed. To make that promise visible we
 * read three things directly from on-chain state on every request:
 *
 *   1) The Token-2022 mint account, which exposes the *current* mint authority. When the
 *      authority is `None`, the supply is permanently sealed (cPEG fixed-supply guarantee).
 *   2) `getTokenSupply` so we report the live circulating supply rather than a snapshot.
 *   3) `getTokenLargestAccounts` for the top-20 holders distribution. This is enough for a
 *      "who actually owns the supply" panel without us standing up a full holder index.
 *
 * The endpoint is deliberately read-only and serverless-friendly. No DB writes, no auth.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  let mintPk: InstanceType<typeof PublicKey>;
  try {
    mintPk = new PublicKey(params.mint);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid mint" }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      authorityAddress: true,
      maxPegs: true,
      pegUnitRaw: true,
      cluster: true,
    },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const connection = new Connection(getClawPegRpcUrl(), "confirmed");

  let mintInfo: Awaited<ReturnType<typeof getMint>> | null = null;
  try {
    mintInfo = await getMint(connection, mintPk, "confirmed", TOKEN_2022_PROGRAM_ID);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Mint not found on-chain" },
      { status: 404 }
    );
  }

  const decimals = mintInfo.decimals;
  const supplyRaw = mintInfo.supply.toString();
  const supplyUi = (Number(mintInfo.supply) / 10 ** decimals).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });
  const mintAuthority = mintInfo.mintAuthority?.toBase58() || null;
  const freezeAuthority = mintInfo.freezeAuthority?.toBase58() || null;
  const isSealed = mintAuthority === null;

  const wholeUnits = decimals === 0 ? Number(mintInfo.supply) : Number(mintInfo.supply / BigInt(10 ** decimals));
  const tokenMetadata = await getTokenMetadata(connection, mintPk, "confirmed", TOKEN_2022_PROGRAM_ID).catch(() => null);

  let topHolders: Array<{ address: string; amount: string; ui_amount: number; share_bps: number }> = [];
  let holderTotal: number | null = null;
  try {
    const top = await connection.getTokenLargestAccounts(mintPk, "confirmed");
    holderTotal = top.value.length;
    const supplyNumber = Number(mintInfo.supply);
    type LargestAccount = (typeof top.value)[number];
    topHolders = top.value
      .filter((row: LargestAccount) => Number(row.amount) > 0)
      .slice(0, 20)
      .map((row: LargestAccount) => ({
        address: row.address.toBase58(),
        amount: row.amount,
        ui_amount: row.uiAmount ?? 0,
        share_bps: supplyNumber > 0 ? Math.round((Number(row.amount) / supplyNumber) * 10_000) : 0,
      }));
  } catch {
    // getTokenLargestAccounts is best-effort. If the RPC is overloaded, return an empty
    // holder list rather than failing the whole request.
  }

  return NextResponse.json({
    success: true,
    token: {
      mint: params.mint,
      cluster: launch.cluster,
      decimals,
      supply_raw: supplyRaw,
      supply_ui: supplyUi,
      whole_units: wholeUnits,
      max_pegs: launch.maxPegs,
      mint_authority: mintAuthority,
      freeze_authority: freezeAuthority,
      is_sealed: isSealed,
      authority_address: launch.authorityAddress,
      metadata: tokenMetadata
        ? {
            name: tokenMetadata.name,
            symbol: tokenMetadata.symbol,
            uri: tokenMetadata.uri,
          }
        : null,
    },
    holders: {
      total_known: holderTotal,
      top: topHolders,
    },
  });
}
