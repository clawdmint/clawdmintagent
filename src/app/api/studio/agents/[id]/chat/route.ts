import { NextRequest, NextResponse } from "next/server";
import { AgentStudioError, sendStudioChatMessage } from "@/lib/agent-studio";

export const dynamic = "force-dynamic";

export async function POST(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const body = await request.json();
 const ownerWalletAddress = String(body?.owner_wallet_address || "").trim();
 const sessionId = String(body?.session_id || "").trim();
 const content = String(body?.content || "");

 if (!ownerWalletAddress || !sessionId) {
 return NextResponse.json(
 { success: false, error: "owner_wallet_address and session_id are required" },
 { status: 400 }
 );
 }

 const { id } = await params;
 const result = await sendStudioChatMessage({
 agentId: id,
 ownerWalletAddress,
 sessionId,
 content,
 });

 return NextResponse.json({ success: true, ...result });
 } catch (error) {
 if (error instanceof AgentStudioError) {
 return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
 }

 console.error("Studio chat error:", error);
 return NextResponse.json({ success: false, error: "Failed to send chat message" }, { status: 500 });
 }
}
