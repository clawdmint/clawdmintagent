import { NextRequest, NextResponse } from "next/server";
import { AgentStudioError, getStudioAgentDetail } from "@/lib/agent-studio";

export const dynamic = "force-dynamic";

function getOwnerWalletAddress(request: NextRequest) {
 return (
 request.nextUrl.searchParams.get("owner_wallet_address") ||
 request.headers.get("x-owner-wallet-address") ||
 ""
 ).trim();
}

export async function GET(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const ownerWalletAddress = getOwnerWalletAddress(request);
 if (!ownerWalletAddress) {
 return NextResponse.json({ success: false, error: "Missing owner wallet address" }, { status: 400 });
 }

 const { id } = await params;
 const agent = await getStudioAgentDetail(id, ownerWalletAddress);
 return NextResponse.json({ success: true, agent });
 } catch (error) {
 if (error instanceof AgentStudioError) {
 return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
 }

 console.error("Get studio agent detail error:", error);
 return NextResponse.json({ success: false, error: "Failed to load studio agent" }, { status: 500 });
 }
}
