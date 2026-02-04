import { NextResponse } from "next/server";
import { validateEnv, clientEnv, serverEnv } from "@/lib/env";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

/**
 * Health check endpoint
 * GET /api/health
 * 
 * Returns system status and environment validation
 */
export async function GET() {
  const validation = validateEnv(process.env["NODE_ENV"] === "production");
  
  // Check database connection
  let dbStatus = "unknown";
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (error) {
    dbStatus = "error";
  }
  
  // Check blockchain connection
  let chainStatus = "unknown";
  try {
    if (clientEnv.alchemyId) {
      const response = await fetch(
        `https://base-sepolia.g.alchemy.com/v2/${clientEnv.alchemyId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1,
          }),
        }
      );
      if (response.ok) {
        chainStatus = "connected";
      }
    } else {
      chainStatus = "not_configured";
    }
  } catch {
    chainStatus = "error";
  }
  
  // Check IPFS
  let ipfsStatus = "unknown";
  if (serverEnv.pinataJwt || serverEnv.pinataApiKey) {
    ipfsStatus = "configured";
  } else {
    ipfsStatus = "not_configured";
  }
  
  const status = {
    status: validation.valid && dbStatus === "connected" ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env["NODE_ENV"] || "development",
    
    services: {
      database: dbStatus,
      blockchain: chainStatus,
      ipfs: ipfsStatus,
    },
    
    config: {
      chainId: clientEnv.chainId,
      network: clientEnv.isMainnet ? "mainnet" : "testnet",
      factoryDeployed: !!clientEnv.factoryAddress,
    },
    
    validation: {
      valid: validation.valid,
      missing: validation.missing,
      warnings: validation.warnings,
    },
  };
  
  return NextResponse.json(status, {
    status: status.status === "healthy" ? 200 : 503,
  });
}
