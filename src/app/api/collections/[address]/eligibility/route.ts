import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { buildCollectionBagsView } from "@/lib/collection-bags";
import { isSolanaAddress } from "@/lib/network-config";
import { getSolanaConnection } from "@/lib/solana-collections";

export const dynamic = "force-dynamic";

function parseDecimal(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const wallet = request.nextUrl.searchParams.get("wallet") || "";

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: "wallet query parameter is required" },
        { status: 400 }
      );
    }

    if (!isSolanaAddress(wallet)) {
      return NextResponse.json(
        { success: false, error: "Wallet must be a Solana address" },
        { status: 400 }
      );
    }

    const collection = await prisma.collection.findFirst({
      where: {
        OR: [{ address: address.toLowerCase() }, { address }],
      },
    });

    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    const bags = buildCollectionBagsView(collection);
    if (!bags || bags.mint_access !== "bags_balance" || !bags.token_address) {
      return NextResponse.json({
        success: true,
        eligible: true,
        reason: "Collection does not require a Bags token balance",
        bags,
      });
    }

    const connection = getSolanaConnection();
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(wallet), {
      mint: new PublicKey(bags.token_address),
    });

    const balance = tokenAccounts.value.reduce((total, tokenAccount) => {
      const parsed = tokenAccount.account.data.parsed;
      const amount = parsed?.info?.tokenAmount?.uiAmountString || parsed?.info?.tokenAmount?.uiAmount || "0";
      return total + parseDecimal(String(amount));
    }, 0);

    const required = parseDecimal(bags.min_token_balance || "0");
    return NextResponse.json({
      success: true,
      eligible: balance >= required,
      wallet,
      bags,
      balance: balance.toString(),
      required: bags.min_token_balance,
      reason:
        balance >= required
          ? "Wallet satisfies the Bags token gate"
          : `Hold at least ${bags.min_token_balance} ${bags.token_symbol || "BAGS"} to mint`,
    });
  } catch (error) {
    console.error("Collection eligibility error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to evaluate collection eligibility" },
      { status: 500 }
    );
  }
}
