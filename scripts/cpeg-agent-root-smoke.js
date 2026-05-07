const { PrismaClient } = require("@prisma/client");
const { PublicKey } = require("@solana/web3.js");

const prisma = new PrismaClient();
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
    console.error(error instanceof Error ? error.message : "cPEG Agent root smoke failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
