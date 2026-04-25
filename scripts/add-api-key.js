const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function generateApiKey() {
  return "clawdmint_" + crypto.randomBytes(32).toString("hex");
}

function parseArgs(argv) {
  const args = { agentEoa: null, agentId: null, agentName: null };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value) continue;
    if (value.startsWith("--eoa=")) args.agentEoa = value.slice(6);
    else if (value.startsWith("--id=")) args.agentId = value.slice(5);
    else if (value.startsWith("--name=")) args.agentName = value.slice(7);
  }
  return args;
}

async function findAgent({ agentEoa, agentId, agentName }) {
  if (agentId) {
    return prisma.agent.findUnique({ where: { id: agentId } });
  }
  if (agentEoa) {
    return prisma.agent.findUnique({ where: { eoa: agentEoa } });
  }
  if (agentName) {
    return prisma.agent.findFirst({
      where: { name: { equals: agentName, mode: "insensitive" } },
    });
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.agentEoa && !args.agentId && !args.agentName) {
    console.error(
      "Usage: node scripts/add-api-key.js --id=<agentId> | --eoa=<eoa> | --name=<agentName>"
    );
    process.exit(1);
  }

  const target = await findAgent(args);
  if (!target) {
    console.error("Agent not found for the provided lookup criteria.");
    process.exit(2);
  }

  const apiKey = generateApiKey();
  const hmacKeyHash = hashApiKey(apiKey);

  const agent = await prisma.agent.update({
    where: { id: target.id },
    data: { hmacKeyHash },
  });

  console.log("API key rotated for agent:", agent.name, `(${agent.id})`);
  console.log("API Key (return this to the operator securely, it will not be shown again):");
  console.log(apiKey);
  console.log("\nUse this in the Authorization header: Bearer <apiKey>");
}

main()
  .catch((error) => {
    console.error("add-api-key failed:", error);
    process.exit(3);
  })
  .finally(() => prisma.$disconnect());
