import { NextRequest, NextResponse } from "next/server";
import { AgentStudioError, runStudioAction } from "@/lib/agent-studio";

export const dynamic = "force-dynamic";

export async function POST(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const body = await request.json();
 const ownerWalletAddress = String(body?.owner_wallet_address || "").trim();
 const action = String(body?.action || "").trim() as "sync-metaplex" | "launch-collection" | "launch-token";
 const payload = typeof body?.payload === "object" && body?.payload ? body.payload : {};

 if (!ownerWalletAddress || !action) {
 return NextResponse.json(
 { success: false, error: "owner_wallet_address and action are required" },
 { status: 400 }
 );
 }

 const { id } = await params;
 const run = await runStudioAction({
 agentId: id,
 ownerWalletAddress,
 action,
 payload,
 });

 return NextResponse.json({ success: true, run });
 } catch (error) {
 if (error instanceof AgentStudioError) {
 return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
 }

 console.error("Run studio action error:", error);
 return NextResponse.json({ success: false, error: "Failed to run studio action" }, { status: 500 });
 }
}
