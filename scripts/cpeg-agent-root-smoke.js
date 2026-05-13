require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PublicKey } = require("@solana/web3.js");

function normalizeDatabaseUrl(raw) {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      return raw;
    }
    // Keep the app URL untouched by default, but let this smoke test use an
    // explicit non-pooled URL when the local machine cannot negotiate TLS with
    // the pooler. Values are never printed.
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("channel_binding");
    url.searchParams.set("sslmode", url.searchParams.get("sslmode") || "require");
    return url.toString();
  } catch {
    return raw;
  }
}

const smokeDatabaseUrl = normalizeDatabaseUrl(
  process.env.CPEG_AGENT_ROOT_SMOKE_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL
);

const prisma = new PrismaClient(
  smokeDatabaseUrl
    ? {
        datasources: {
          db: {
            url: smokeDatabaseUrl,
          },
        },
      }
    : undefined
);
const AGENT_IDENTITY_PROGRAM_ID = new PublicKey("1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p");

function deriveAgentIdentityPda(agentAssetAddress) {
  const asset = new PublicKey(agentAssetAddress);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent_identity"), asset.toBuffer()],
    AGENT_IDENTITY_PROGRAM_ID
  );
  return pda.toBase58();
}

function validateAgentRoot(agent) {
  if (!agent.metaplexAssetAddress) throw new Error("missing asset");
  const derived = deriveAgentIdentityPda(agent.metaplexAssetAddress);
  if (agent.metaplexIdentityPda && agent.metaplexIdentityPda !== derived) {
    throw new Error("identity PDA mismatch");
  }
}

async function main() {
  const agents = await prisma.agent.findMany({
    where: {
      status: "VERIFIED",
      deployEnabled: true,
      metaplexAssetAddress: { not: null },
    },
    select: {
      metaplexAssetAddress: true,
      metaplexIdentityPda: true,
    },
    take: 25,
  });

  let valid = 0;
  let invalid = 0;
  for (const agent of agents) {
    try {
      validateAgentRoot(agent);
      valid += 1;
    } catch {
      invalid += 1;
    }
  }

  const launches = await prisma.clawPegLaunch.groupBy({
    by: ["identityMode"],
    _count: { _all: true },
  });

  console.log("cPEG Agent root smoke");
  console.log(`verified_agent_roots_checked=${agents.length}`);
  console.log(`valid_agent_roots=${valid}`);
  console.log(`invalid_agent_roots=${invalid}`);
  console.log(
    `launch_identity_modes=${launches
      .map((row) => `${row.identityMode}:${row._count._all}`)
      .join(",") || "none"}`
  );

  if (invalid > 0) {
    throw new Error("Some verified agent roots failed validation.");
  }
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "cPEG Agent root smoke failed";
    if (/TLS connection|identity|certificate|ssl/i.test(message)) {
      console.error(
        [
          "cPEG Agent root smoke could not open the database TLS connection.",
          "No secret values were printed.",
          "Use a Neon direct/non-pooled URL without -pooler, pgbouncer=true, or channel_binding=require.",
          "Set CPEG_AGENT_ROOT_SMOKE_DATABASE_URL or DIRECT_URL to that URL with sslmode=require, then rerun npm run cpeg:agent-root-smoke.",
        ].join("\n")
      );
    } else {
      console.error(message);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
