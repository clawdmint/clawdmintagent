import { NextRequest, NextResponse } from "next/server";
import { AgentStudioError, toggleStudioSkill } from "@/lib/agent-studio";

export const dynamic = "force-dynamic";

export async function PATCH(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const body = await request.json();
 const ownerWalletAddress = String(body?.owner_wallet_address || "").trim();
 const skillKey = String(body?.skill_key || "").trim();
 const enabled = Boolean(body?.enabled);

 if (!ownerWalletAddress || !skillKey) {
 return NextResponse.json(
 { success: false, error: "owner_wallet_address and skill_key are required" },
 { status: 400 }
 );
 }

 const { id } = await params;
 const skill = await toggleStudioSkill({
 agentId: id,
 ownerWalletAddress,
 skillKey,
 enabled,
 });

 return NextResponse.json({ success: true, skill });
 } catch (error) {
 if (error instanceof AgentStudioError) {
 return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
 }

 console.error("Toggle studio skill error:", error);
 return NextResponse.json({ success: false, error: "Failed to update skill" }, { status: 500 });
 }
}
