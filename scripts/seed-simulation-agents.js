#!/usr/bin/env node
/**
 * Seed 100 Simulation Agents into the Database
 * Creates realistic-looking AI agent entries for the agents page.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const AGENT_PREFIXES = [
  'Aether', 'Binary', 'Cipher', 'Delta', 'Echo', 'Flux', 'Gamma', 'Helix',
  'Ion', 'Jolt', 'Krypto', 'Luna', 'Mach', 'Nexus', 'Omega', 'Pulse',
  'Quark', 'Rune', 'Sigma', 'Tesla', 'Ultra', 'Vortex', 'Warp', 'Xenon',
  'Zeta', 'Nova', 'Orion', 'Phantom', 'Quantum', 'Raze', 'Spark', 'Titan',
  'Vector', 'Wraith', 'Arc', 'Blaze', 'Core', 'Drift', 'Ember', 'Forge',
  'Glitch', 'Haze', 'Ink', 'Jade', 'Kite', 'Lux', 'Mint', 'Nyx',
  'Opal', 'Pike', 'Rex', 'Sol', 'Thorn', 'Volt', 'Wave', 'Xero',
];

const AGENT_SUFFIXES = [
  'Bot', 'AI', 'Agent', 'Core', 'Mind', 'Net', 'Proto', 'System',
  'X', 'Zero', 'One', 'Prime', 'Max', 'Ops', 'Hub', 'Lab',
  'Node', 'Link', 'Byte', 'Bit', 'Data', 'Code', 'Dev', 'Tech',
];

const DESCRIPTIONS = [
  'Autonomous NFT collection deployer specializing in generative art.',
  'AI-powered creative agent building digital collectibles on Base.',
  'On-chain art generator with advanced trait randomization systems.',
  'Decentralized deployment agent for next-gen NFT collections.',
  'Neural network-driven artist creating unique digital assets.',
  'Smart contract deployer focused on Base ecosystem innovation.',
  'Generative art specialist with multi-chain deployment capabilities.',
  'AI agent crafting algorithmic NFT collections with rarity engines.',
  'Automated collection deployer with on-chain metadata generation.',
  'Creative AI building the future of digital ownership on Base.',
];

const STATUSES = ['VERIFIED', 'VERIFIED', 'VERIFIED', 'CLAIMED', 'PENDING'];

function randomHex(bytes) {
  return '0x' + crypto.randomBytes(bytes).toString('hex');
}

function randomEthAddress() {
  return '0x' + crypto.randomBytes(20).toString('hex');
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log('\n  Seeding 100 simulation agents...\n');

  const agents = [];
  const usedNames = new Set();
  const usedEoas = new Set();

  for (let i = 0; i < 100; i++) {
    let name;
    do {
      name = pick(AGENT_PREFIXES) + pick(AGENT_SUFFIXES);
    } while (usedNames.has(name));
    usedNames.add(name);

    let eoa;
    do {
      eoa = randomEthAddress();
    } while (usedEoas.has(eoa));
    usedEoas.add(eoa);

    const status = pick(STATUSES);
    const hasX = Math.random() > 0.6;
    const hasDesc = Math.random() > 0.3;

    agents.push({
      name,
      eoa,
      description: hasDesc ? pick(DESCRIPTIONS) : null,
      avatarUrl: null,
      xHandle: hasX ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : null,
      status,
      deployEnabled: status === 'VERIFIED',
      verifiedAt: status === 'VERIFIED' ? new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000) : null,
    });
  }

  // Batch create
  let created = 0;
  for (const agent of agents) {
    try {
      await prisma.agent.create({ data: agent });
      created++;
      if (created % 20 === 0) console.log(`  [${created}/100] agents created...`);
    } catch (e) {
      // Skip duplicates
    }
  }

  console.log(`\n  ✅ ${created} simulation agents seeded!\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FATAL:', err);
  prisma.$disconnect();
  process.exit(1);
});
