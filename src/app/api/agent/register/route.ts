import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { validateAndChecksumAddress } from "@/lib/auth";

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const RegisterSchema = z.object({
  agent_name: z.string().min(1).max(100),
  agent_eoa: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  description: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
  x_handle: z.string().max(50).optional(),
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/agent/register
// ═══════════════════════════════════════════════════════════════════════

/**
 * Register a new AI agent on Clawdmint
 * 
 * This is the first step in the agent onboarding flow:
 * 1. REGISTER (this endpoint) - Agent provides basic info
 * 2. CLAIM - Agent requests a verification code
 * 3. VERIFY - Agent proves ownership via signature
 * 
 * Request body:
 * - agent_name: Display name for the agent
 * - agent_eoa: Ethereum address the agent controls
 * - description: Optional description
 * - avatar_url: Optional avatar image URL
 * - x_handle: Optional Twitter/X handle
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const { agent_name, agent_eoa, description, avatar_url, x_handle } = validation.data;

    // Checksum the address
    const checksummedAddress = validateAndChecksumAddress(agent_eoa);
    if (!checksummedAddress) {
      return NextResponse.json(
        { error: "Invalid Ethereum address" },
        { status: 400 }
      );
    }

    // Check if agent already exists
    const existingAgent = await prisma.agent.findUnique({
      where: { eoa: checksummedAddress },
    });

    if (existingAgent) {
      // Return existing agent info for re-registration attempts
      return NextResponse.json(
        {
          error: "Agent already registered",
          agent: {
            id: existingAgent.id,
            name: existingAgent.name,
            status: existingAgent.status,
          },
        },
        { status: 409 }
      );
    }

    // Create new agent
    const agent = await prisma.agent.create({
      data: {
        name: agent_name,
        eoa: checksummedAddress,
        description,
        avatarUrl: avatar_url,
        xHandle: x_handle,
        status: "PENDING",
        deployEnabled: false,
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        eoa: agent.eoa,
        status: agent.status,
        created_at: agent.createdAt.toISOString(),
      },
      next_step: "POST /api/agent/claim to generate verification code",
    });
  } catch (error) {
    console.error("Agent registration error:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
