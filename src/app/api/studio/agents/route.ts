import { NextRequest, NextResponse } from "next/server";
import { CreateStudioAgentSchema, createStudioAgent, listStudioAgents, AgentStudioError } from "@/lib/agent-studio";

export const dynamic = "force-dynamic";

function getOwnerWalletAddress(request: NextRequest) {
 return (
 request.nextUrl.searchParams.get("owner_wallet_address") ||
 request.headers.get("x-owner-wallet-address") ||
 ""
 ).trim();
}

export async function GET(request: NextRequest) {
 try {
 const ownerWalletAddress = getOwnerWalletAddress(request);
 if (!ownerWalletAddress) {
 return NextResponse.json({ success: false, error: "Missing owner wallet address" }, { status: 400 });
 }

 const agents = await listStudioAgents(ownerWalletAddress);
 return NextResponse.json({ success: true, agents });
 } catch (error) {
 console.error("List studio agents error:", error);
 return NextResponse.json({ success: false, error: "Failed to load studio agents" }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const parsed = CreateStudioAgentSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json(
 { success: false, error: "Invalid studio agent payload", details: parsed.error.flatten() },
 { status: 400 }
 );
 }

 const agent = await createStudioAgent(parsed.data);
 return NextResponse.json({ success: true, agent });
 } catch (error) {
 if (error instanceof AgentStudioError) {
 return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
 }

 console.error("Create studio agent error:", error);
 return NextResponse.json({ success: false, error: "Failed to create studio agent" }, { status: 500 });
 }
}
