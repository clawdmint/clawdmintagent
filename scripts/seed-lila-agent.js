/**
 * Seed "Lila" Agent into the Database
 * 
 * Creates the Lila AI agent that will be shown as the deployer
 * of the Clawdmint Agents collection.
 * 
 * Usage:
 *   node scripts/seed-lila-agent.js
 * 
 * Prerequisites:
 *   DATABASE_URL in .env
 *   DEPLOYER_PRIVATE_KEY in .env (used to derive Lila's EOA)
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Lila's identity
const LILA = {
  name: 'Lila',
  description: 'Clawdmint\'s resident AI artist. Creator of the 10,000-piece Clawdmint Agents collection — procedurally generated isometric robots with unique traits, rarity tiers, and hidden mythic names.',
  avatarUrl: '/agents/lila-avatar.png',
  xHandle: 'clawdmint',
  status: 'VERIFIED',
  deployEnabled: true,
};

async function main() {
  // Derive EOA from deployer private key
  let eoa;
  try {
    const { privateKeyToAccount } = require('viem/accounts');
    const key = process.env.DEPLOYER_PRIVATE_KEY;
    if (!key) {
      console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in .env');
      process.exit(1);
    }
    const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
    eoa = account.address;
  } catch (err) {
    console.error('ERROR deriving EOA:', err.message);
    process.exit(1);
  }

  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║       SEED LILA AGENT                    ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  Name:   ${LILA.name}`);
  console.log(`  EOA:    ${eoa}`);
  console.log(`  Status: ${LILA.status}`);
  console.log('');

  // Upsert — create or update
  const agent = await prisma.agent.upsert({
    where: { eoa },
    update: {
      name: LILA.name,
      description: LILA.description,
      avatarUrl: LILA.avatarUrl,
      xHandle: LILA.xHandle,
      status: LILA.status,
      deployEnabled: LILA.deployEnabled,
      verifiedAt: new Date(),
    },
    create: {
      name: LILA.name,
      eoa,
      description: LILA.description,
      avatarUrl: LILA.avatarUrl,
      xHandle: LILA.xHandle,
      status: LILA.status,
      deployEnabled: LILA.deployEnabled,
      verifiedAt: new Date(),
    },
  });

  console.log(`  ✅ Lila agent seeded successfully!`);
  console.log(`  ID:   ${agent.id}`);
  console.log(`  EOA:  ${agent.eoa}`);
  console.log('');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FATAL:', err);
  prisma.$disconnect();
  process.exit(1);
});
