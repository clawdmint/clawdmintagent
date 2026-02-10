require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const AGENT_ID = 'cmle5y1wr000058gfxgutjfa9';
const OLD_COLLECTION_ID = 'cmle6i5qp0001skelhyvr5mn7';
const AGENTS_CONTRACT = '0x8641aa95cb2913bde395cdc8d802404d6eeecd0a';

async function run() {
  // 1. Remove old "Lila Genesis" collection
  console.log('Removing Lila Genesis collection...');
  await prisma.collection.delete({ where: { id: OLD_COLLECTION_ID } }).catch(() => {
    console.log('  Already removed or not found');
  });

  // 2. Create CLAWDMINT_AGENTS collection linked to this agent
  console.log('Adding Clawdmint Agents collection...');
  const existing = await prisma.collection.findFirst({ where: { address: AGENTS_CONTRACT } });
  if (existing) {
    console.log('  Collection already exists, updating agentId...');
    await prisma.collection.update({
      where: { id: existing.id },
      data: { agentId: AGENT_ID },
    });
  } else {
    await prisma.collection.create({
      data: {
        address: AGENTS_CONTRACT,
        deployTxHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        agentId: AGENT_ID,
        agentEoa: 'pending_1f0de1042b4cc2db',
        name: 'Clawdmint Agents',
        symbol: 'CAGENT',
        description: '10,000 unique AI-powered agent NFTs on Base. Procedurally generated isometric robots with on-chain traits, rarity tiers, and hidden mythic names.',
        imageUrl: '/agents/placeholder.svg',
        baseUri: 'https://clawdmint.xyz/api/metadata/placeholder/',
        maxSupply: 10000,
        mintPrice: '500000000000000',
        royaltyBps: 500,
        payoutAddress: '0xC1e76AaBf34d11789Cad3D2006A47749c3217972',
        totalMinted: 200,
        status: 'ACTIVE',
      },
    });
  }

  // 3. Verify
  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID },
    include: { collections: true },
  });
  console.log('\nAgent:', agent.name);
  console.log('Collections:');
  agent.collections.forEach(c => {
    console.log('  -', c.name, '|', c.address, '| status:', c.status);
  });

  await prisma.$disconnect();
  console.log('\nDone!');
}

run().catch(console.error);
