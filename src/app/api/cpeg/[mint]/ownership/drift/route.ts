import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { NextRequest, NextResponse } from "next/server";
import {
  buildClawPegSyncPegManifest,
  findOwnerPegAddress,
  parseClawPegOwnerPegAccount,
} from "@/lib/clawpeg";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

function parseBigInt(value: string | number | bigint | null | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return BigInt(0);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const owner = request.nextUrl.searchParams.get("owner") || "";
  if (!owner) {
    return NextResponse.json({ success: false, error: "owner query is required" }, { status: 400 });
  }

  let ownerPk: InstanceType<typeof PublicKey>;
  try {
    ownerPk = new PublicKey(owner);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid owner address" }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: { tokenMint: true, collectionAddress: true, pegUnitRaw: true },
  });
  if (!launch?.collectionAddress) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const mintPk = new PublicKey(launch.tokenMint);
  const ownerPegAddress = findOwnerPegAddress(launch.collectionAddress, ownerPk.toBase58());
  const ownerTokenAccount = getAssociatedTokenAddressSync(mintPk, ownerPk, false, TOKEN_2022_PROGRAM_ID);

  const [ownerPegInfo, parsedTokenAccounts] = await Promise.all([
    connection.getAccountInfo(ownerPegAddress, "confirmed"),
    connection.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk }, "confirmed"),
  ]);

  const totalRaw = parsedTokenAccounts.value.reduce((sum: bigint, row: (typeof parsedTokenAccounts.value)[number]) => {
    const amount = row.account.data.parsed.info.tokenAmount?.amount as string | undefined;
    return sum + parseBigInt(amount);
  }, BigInt(0));
  const pegUnitRaw = parseBigInt(launch.pegUnitRaw);
  const wholeUnits = pegUnitRaw > BigInt(0) ? Number(totalRaw / pegUnitRaw) : 0;

  const ownerPegState = ownerPegInfo ? parseClawPegOwnerPegAccount(Buffer.from(ownerPegInfo.data)) : null;
  const syncedCapacity = ownerPegState?.syncedCapacity ?? 0;
  const activeCount = ownerPegState?.activeCount ?? 0;
  const drift = !ownerPegState || syncedCapacity !== wholeUnits || activeCount > wholeUnits;

  return NextResponse.json({
    success: true,
    owner: ownerPk.toBase58(),
    token_mint: launch.tokenMint,
    owner_peg_address: ownerPegAddress.toBase58(),
    owner_token_account: ownerTokenAccount.toBase58(),
    token_raw_balance: totalRaw.toString(),
    whole_units: wholeUnits,
    owner_peg: ownerPegState
      ? {
          synced_capacity: ownerPegState.syncedCapacity,
          active_count: ownerPegState.activeCount,
          generation: ownerPegState.generation,
          last_synced_slot: ownerPegState.lastSyncedSlot.toString(),
        }
      : null,
    drift,
    recommendation: drift
      ? {
          action: "syncPeg",
          reason: "OwnerPeg capacity does not match current Token-2022 whole units.",
          instruction: buildClawPegSyncPegManifest({
            owner: ownerPk.toBase58(),
            ownerTokenAccount: ownerTokenAccount.toBase58(),
            tokenMint: launch.tokenMint,
          }),
        }
      : null,
  });
}
