import { Connection } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  buildClawPegInitializeOwnerPegManifest,
  buildClawPegMintPegManifest,
  buildClawPegSyncPegManifest,
  findOwnerPegAddress,
  findPegRecordAddress,
} from "@/lib/clawpeg";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    mint: string;
  };
}

const PreparePegSchema = z.object({
  owner: z.string().min(32),
  payer: z.string().min(32).optional(),
  owner_token_account: z.string().min(32),
  peg_id: z.number().int().min(0),
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json();
    const parsed = PreparePegSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const launch = await prisma.clawPegLaunch.findUnique({
      where: { tokenMint: params.mint },
      select: {
        tokenMint: true,
        collectionAddress: true,
        cluster: true,
      },
    });
    if (!launch?.collectionAddress) {
      return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
    }

    const input = parsed.data;
    const payer = input.payer || input.owner;
    const ownerPeg = findOwnerPegAddress(launch.collectionAddress, input.owner);
    const pegRecord = findPegRecordAddress(launch.collectionAddress, input.peg_id);
    const connection = new Connection(getClawPegRpcUrl(), "confirmed");
    const [ownerPegAccount, pegRecordAccount] = await Promise.all([
      connection.getAccountInfo(ownerPeg, "confirmed"),
      connection.getAccountInfo(pegRecord, "confirmed"),
    ]);

    if (pegRecordAccount) {
      return NextResponse.json(
        { success: false, error: `cPEG #${input.peg_id} is already minted` },
        { status: 409 }
      );
    }

    const instructions = [
      ...(ownerPegAccount
        ? []
        : [
            buildClawPegInitializeOwnerPegManifest({
              payer,
              owner: input.owner,
              tokenMint: params.mint,
            }),
          ]),
      buildClawPegSyncPegManifest({
        owner: input.owner,
        ownerTokenAccount: input.owner_token_account,
        tokenMint: params.mint,
      }),
      buildClawPegMintPegManifest({
        payer,
        owner: input.owner,
        ownerTokenAccount: input.owner_token_account,
        tokenMint: params.mint,
        pegId: input.peg_id,
      }),
    ];

    return NextResponse.json({
      success: true,
      peg: {
        id: input.peg_id,
        token_mint: params.mint,
        owner: input.owner,
        owner_peg: ownerPeg.toBase58(),
        peg_record: pegRecord.toBase58(),
        image: `/api/cpeg/${params.mint}/pegs/${input.peg_id}/svg`,
      },
      instructions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG mint";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
