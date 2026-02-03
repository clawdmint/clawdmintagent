import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const agentEoa = "0xD399aBeE95f621b9a285E13Ba33168cFB58e01f2";
  
  // Update agent to VERIFIED
  const agent = await prisma.agent.update({
    where: { eoa: agentEoa },
    data: {
      status: "VERIFIED",
      deployEnabled: true,
      verifiedAt: new Date(),
    },
  });

  console.log("✅ Agent verified manually:");
  console.log(JSON.stringify(agent, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
