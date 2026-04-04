require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs",
    moduleResolution: "node",
  },
});

const { prisma } = require("../src/lib/db");
const {
  ensureMetaplexAgentRegistration,
  MetaplexAgentRegistryError,
} = require("../src/lib/metaplex-agent-registry");

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const onlyRegistered = args.includes("--only-registered");
  const parsedLimit = limitArg ? Number.parseInt(limitArg.split("=")[1] || "0", 10) : undefined;

  return {
    dryRun,
    onlyRegistered,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
  };
}

async function loadTargets(onlyRegistered, limit) {
  return prisma.agent.findMany({
    where: {
      status: "VERIFIED",
      deployEnabled: true,
      solanaWalletAddress: { not: null },
      solanaWalletEncryptedKey: { not: null },
      ...(onlyRegistered
        ? {
            OR: [
              { metaplexAssetAddress: { not: null } },
              { metaplexIdentityPda: { not: null } },
              { metaplexRegistrationUri: { not: null } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      verifiedAt: "asc",
    },
    take: limit,
  });
}

async function main() {
  const { dryRun, onlyRegistered, limit } = parseArgs();
  const targets = await loadTargets(onlyRegistered, limit);

  if (targets.length === 0) {
    console.log("No verified agent found for Metaplex re-sync.");
    return;
  }

  console.log(
    `Preparing Metaplex re-sync for ${targets.length} agent(s)` +
      (dryRun ? " [dry-run]" : "") +
      (onlyRegistered ? " [registered-only]" : "")
  );

  let successCount = 0;
  let failureCount = 0;

  for (const target of targets) {
    if (dryRun) {
      console.log(`- would sync ${target.name} (${target.id})`);
      continue;
    }

    try {
      const result = await ensureMetaplexAgentRegistration(target.id);
      successCount += 1;
      console.log(
        `- synced ${target.name} (${target.id}) -> ${result.identity_pda || "no-identity-pda"}`
      );
    } catch (error) {
      failureCount += 1;
      const message =
        error instanceof MetaplexAgentRegistryError
          ? `${error.message}${error.details ? ` | ${JSON.stringify(error.details)}` : ""}`
          : error instanceof Error
            ? error.message
            : "Unknown error";

      console.error(`- failed ${target.name} (${target.id}) -> ${message}`);
    }
  }

  if (!dryRun) {
    console.log("");
    console.log(`Metaplex re-sync complete: ${successCount} success, ${failureCount} failed.`);
    if (failureCount > 0) {
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    console.error("Fatal Metaplex re-sync error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
