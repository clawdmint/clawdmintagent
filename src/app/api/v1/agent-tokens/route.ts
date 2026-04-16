import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CreateLaunchInput } from "@metaplex-foundation/genesis";
import { prisma } from "@/lib/db";
import { AgentWalletError, getAgentOperationalWalletAddress } from "@/lib/agent-wallets";
import {
  ensureMetaplexAgentRegistration,
  getAgentMetaplexSummary,
  MetaplexAgentRegistryError,
} from "@/lib/metaplex-agent-registry";
import { AgentTokenLaunchError, launchMetaplexAgentToken } from "@/lib/metaplex-agent-tokens";
import { isSolanaAddress } from "@/lib/network-config";

export const dynamic = "force-dynamic";

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

const AgentTokenLaunchSchema = z.object({
  launch_type: z.enum(["bondingCurve", "launchpool"]).default("bondingCurve"),
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/),
  image: z.string().url(),
  description: z.string().max(250).optional(),
  website_url: z.string().url().optional(),
  twitter: z.string().max(200).optional(),
  telegram: z.string().max(200).optional(),
  quote_mint: z.enum(["SOL", "USDC"]).default("SOL"),
  set_token_on_agent: z.boolean().default(true),
  creator_fee_wallet: z.string().optional(),
  first_buy_amount: z.number().min(0).optional(),
  launchpool: z
    .object({
      token_allocation: z.number().int().min(1).max(1_000_000_000),
      deposit_start_time: z.string().datetime(),
      raise_goal: z.number().positive(),
      raydium_liquidity_bps: z.number().int().min(2000).max(10000),
      funds_recipient: z.string().optional(),
    })
    .optional(),
});

function buildExternalLinks(input: z.infer<typeof AgentTokenLaunchSchema>) {
  const links: Record<string, string> = {};
  if (input.website_url) links.website = input.website_url;
  if (input.twitter) links.twitter = input.twitter;
  if (input.telegram) links.telegram = input.telegram;
  return Object.keys(links).length > 0 ? links : undefined;
}

function getGenesisNetwork(): "solana-mainnet" | "solana-devnet" {
  return process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "solana-devnet" : "solana-mainnet";
}

function buildLaunchInput(
  input: z.infer<typeof AgentTokenLaunchSchema>,
  agentWallet: string,
  agentMintAddress: string | null
): CreateLaunchInput {
  const token = {
    name: input.name,
    symbol: input.symbol,
    image: input.image,
    ...(input.description ? { description: input.description } : {}),
    ...(buildExternalLinks(input) ? { externalLinks: buildExternalLinks(input) } : {}),
  };

  const common = {
    wallet: agentWallet,
    network: getGenesisNetwork(),
    quoteMint: input.quote_mint,
    token,
    ...(input.set_token_on_agent && agentMintAddress
      ? {
          agent: {
            mint: agentMintAddress,
            setToken: true,
          },
        }
      : {}),
  } as const;

  if (input.launch_type === "launchpool") {
    if (!input.launchpool) {
      throw new AgentTokenLaunchError(400, "launchpool configuration is required for launchpool launches");
    }

    const fundsRecipient = input.launchpool.funds_recipient || agentWallet;
    if (!isSolanaAddress(fundsRecipient)) {
      throw new AgentTokenLaunchError(400, "Launchpool funds recipient must be a valid Solana address");
    }

    return {
      ...common,
      launchType: "launchpool",
      launch: {
        launchpool: {
          tokenAllocation: input.launchpool.token_allocation,
          depositStartTime: input.launchpool.deposit_start_time,
          raiseGoal: input.launchpool.raise_goal,
          raydiumLiquidityBps: input.launchpool.raydium_liquidity_bps,
          fundsRecipient,
        },
      },
    };
  }

  if (input.creator_fee_wallet && !isSolanaAddress(input.creator_fee_wallet)) {
    throw new AgentTokenLaunchError(400, "Creator fee wallet must be a valid Solana address");
  }

  return {
    ...common,
    launchType: "bondingCurve",
    launch: {
      ...(input.creator_fee_wallet ? { creatorFeeWallet: input.creator_fee_wallet } : {}),
      ...(typeof input.first_buy_amount === "number" ? { firstBuyAmount: input.first_buy_amount } : {}),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header", hint: "Use: Authorization: Bearer YOUR_API_KEY" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
      select: {
        id: true,
        name: true,
        status: true,
        deployEnabled: true,
        solanaWalletAddress: true,
        solanaWalletEncryptedKey: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ success: false, error: "Invalid API key" }, { status: 401 });
    }

    if (agent.status !== "VERIFIED" || !agent.deployEnabled) {
      return NextResponse.json(
        { success: false, error: "Agent not verified", hint: "Complete the claim flow and fund the Solana wallet first" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = AgentTokenLaunchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const agentWallet = getAgentOperationalWalletAddress(agent);
    let metaplex = await getAgentMetaplexSummary(agent.id);

    if (parsed.data.set_token_on_agent && !metaplex?.registered) {
      metaplex = await ensureMetaplexAgentRegistration(agent.id);
    }

    const launchInput = buildLaunchInput(parsed.data, agentWallet, metaplex?.asset_address || null);
    const launched = await launchMetaplexAgentToken(agent, launchInput);

    const feeRecipient =
      parsed.data.launch_type === "launchpool"
        ? parsed.data.launchpool?.funds_recipient || agentWallet
        : parsed.data.creator_fee_wallet || agentWallet;

    const saved = await prisma.tokenLaunch.create({
      data: {
        agentId: agent.id,
        tokenName: parsed.data.name,
        tokenSymbol: parsed.data.symbol,
        tokenAddress: launched.mintAddress,
        txHash: launched.signature,
        launchType: parsed.data.launch_type,
        network: launched.network,
        genesisAccount: launched.genesisAccount,
        launchId: launched.launchId,
        launchUrl: launched.launchUrl,
        description: parsed.data.description,
        imageUrl: parsed.data.image,
        websiteUrl: parsed.data.website_url,
        tweetUrl: parsed.data.twitter,
        chain: launched.chain,
        launcherAddress: launched.launcherAddress,
        feeRecipient,
        feeDistribution: JSON.stringify({
          quoteMint: parsed.data.quote_mint,
          signatures: launched.signatures,
          dexscreenerUrl: launched.dexscreenerUrl,
          explorerUrl: launched.explorerUrl,
        }),
        setOnAgent: Boolean(parsed.data.set_token_on_agent && metaplex?.asset_address),
        simulated: false,
      },
    });

    return NextResponse.json({
      success: true,
      token: {
        id: saved.id,
        name: saved.tokenName,
        symbol: saved.tokenSymbol,
        mint_address: saved.tokenAddress,
        launch_type: saved.launchType,
        network: saved.network,
        genesis_account: saved.genesisAccount,
        launch_id: saved.launchId,
        launch_url: saved.launchUrl,
        tx_hash: saved.txHash,
        chain: saved.chain,
        launcher_address: saved.launcherAddress,
        set_on_agent: saved.setOnAgent,
        image_url: saved.imageUrl,
        description: saved.description,
        website_url: saved.websiteUrl,
        explorer_url: launched.explorerUrl,
        dexscreener_url: launched.dexscreenerUrl,
        created_at: saved.createdAt.toISOString(),
      },
      agent: {
        id: agent.id,
        wallet_address: agentWallet,
        metaplex_asset_address: metaplex?.asset_address || null,
      },
      message: saved.setOnAgent
        ? "Agent token launched and linked to the agent identity."
        : "Agent token launched from the agent wallet.",
    });
  } catch (error) {
    if (
      error instanceof AgentTokenLaunchError ||
      error instanceof AgentWalletError ||
      error instanceof MetaplexAgentRegistryError
    ) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.status }
      );
    }

    console.error("Agent token launch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to launch agent token" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
      select: {
        id: true,
        solanaWalletAddress: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ success: false, error: "Invalid API key" }, { status: 401 });
    }

    const launches = await prisma.tokenLaunch.findMany({
      where: {
        OR: [
          { agentId: agent.id },
          agent.solanaWalletAddress
            ? {
                launcherAddress: {
                  equals: agent.solanaWalletAddress,
                  mode: "insensitive",
                },
              }
            : undefined,
        ].filter(Boolean) as NonNullable<unknown>[],
        chain: { in: ["solana", "solana-devnet"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      launches: launches.map((launch) => ({
        id: launch.id,
        name: launch.tokenName,
        symbol: launch.tokenSymbol,
        mint_address: launch.tokenAddress,
        tx_hash: launch.txHash,
        launch_type: launch.launchType,
        network: launch.network,
        genesis_account: launch.genesisAccount,
        launch_id: launch.launchId,
        launch_url: launch.launchUrl,
        chain: launch.chain,
        set_on_agent: launch.setOnAgent,
        image_url: launch.imageUrl,
        website_url: launch.websiteUrl,
        created_at: launch.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("List agent token launches error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list agent token launches" },
      { status: 500 }
    );
  }
}
