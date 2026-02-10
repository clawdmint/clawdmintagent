require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const agent = await prisma.agent.findUnique({
    where: { id: 'cmle5y1wr000058gfxgutjfa9' },
    include: { collections: true },
  });
  if (agent) {
    console.log('Agent:', agent.name);
    console.log('EOA:', agent.eoa);
    console.log('Collections:', agent.collections.length);
    agent.collections.forEach(c => {
      console.log('  - id:', c.id, '| name:', c.name, '| address:', c.address, '| status:', c.status);
    });
  } else {
    console.log('Agent not found');
  }
  await prisma.$disconnect();
}

run().catch(console.error);
