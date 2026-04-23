import { NextRequest, NextResponse } from "next/server";
import { getWalletReputation } from "@/lib/fairscale";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> },
) {
  try {
    const { walletAddress } = await params;
    const reputation = await getWalletReputation(walletAddress);

    return NextResponse.json({
      success: true,
      wallet_address: walletAddress,
      reputation,
    });
  } catch (error) {
    console.error("Get reputation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get reputation" },
      { status: 500 },
    );
  }
}
