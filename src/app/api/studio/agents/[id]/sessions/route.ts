import { NextRequest, NextResponse } from "next/server";
import { AgentStudioError, createStudioSession } from "@/lib/agent-studio";

export const dynamic = "force-dynamic";

export async function POST(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const body = await request.json();
 const ownerWalletAddress = String(body?.owner_wallet_address || "").trim();
 const title = typeof body?.title === "string" ? body.title : undefined;

 if (!ownerWalletAddress) {
 return NextResponse.json({ success: false, error: "Missing owner wallet address" }, { status: 400 });
 }

 const { id } = await params;
 const session = await createStudioSession(id, ownerWalletAddress, title);
 return NextResponse.json({ success: true, session });
 } catch (error) {
 if (error instanceof AgentStudioError) {
 return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
 }

 console.error("Create studio session error:", error);
 return NextResponse.json({ success: false, error: "Failed to create session" }, { status: 500 });
 }
}
