const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

async function main() {
  const agentEoa = "0xD399aBeE95f621b9a285E13Ba33168cFB58e01f2";
  
  // Generate API key
  const apiKey = "clawdmint_" + crypto.randomBytes(32).toString("hex");
  
  // Update agent with API key
  const agent = await prisma.agent.update({
    where: { eoa: agentEoa },
    data: {
      hmacKeyHash: apiKey,
    },
  });

  console.log("✅ API Key added:");
  console.log("Agent:", agent.name);
  console.log("API Key:", apiKey);
  console.log("\nUse this in Authorization header: Bearer " + apiKey);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
