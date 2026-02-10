#!/usr/bin/env node
/**
 * Clawdmint Agents — Collection Deployment Script
 * 
 * Deploys the 10K Agents collection through the ClawdmintFactory contract.
 * 
 * Steps:
 *   1. Read IPFS CIDs from output/ipfs-cids.json
 *   2. Verify deployer wallet balance and allowlist status
 *   3. Deploy collection via Factory.deployCollection()
 *   4. Save deployment info
 * 
 * Usage:
 *   node scripts/deploy-agents-collection.js [--dry-run]
 * 
 * Environment:
 *   DEPLOYER_PRIVATE_KEY — Deployer wallet private key
 *   NEXT_PUBLIC_FACTORY_ADDRESS — Factory contract address
 *   NEXT_PUBLIC_CHAIN_ID — Chain ID (8453 for Base mainnet)
 *   NEXT_PUBLIC_ALCHEMY_ID — Alchemy API key
 *   TREASURY_ADDRESS — Treasury address for fee collection
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createPublicClient, createWalletClient, http, parseEther, formatEther } = require('viem');
const { base, baseSepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

// ═══════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v ?? true; return acc;
}, {});

const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453');
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const TREASURY = process.env.TREASURY_ADDRESS;
const ALCHEMY_ID = process.env.NEXT_PUBLIC_ALCHEMY_ID;

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const CIDS_FILE = path.join(OUTPUT_DIR, 'ipfs-cids.json');
const DEPLOY_FILE = path.join(OUTPUT_DIR, 'deployment.json');

// Collection parameters
const COLLECTION_NAME = 'Clawdmint Agents';
const COLLECTION_SYMBOL = 'CAGENT';
const MAX_SUPPLY = 10000n;
const MINT_PRICE = parseEther('0.0005'); // ~$1.50 platform fee per mint (free mint)
const ROYALTY_BPS = 500n; // 5% royalty

// ═══════════════════════════════════════════════════════════════════════
// ABI (minimal — only what we need)
// ═══════════════════════════════════════════════════════════════════════

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'isAgentAllowed',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deployCollection',
    inputs: [{
      name: 'params',
      type: 'tuple',
      components: [
        { name: 'name', type: 'string' },
        { name: 'symbol', type: 'string' },
        { name: 'baseURI', type: 'string' },
        { name: 'maxSupply', type: 'uint256' },
        { name: 'mintPrice', type: 'uint256' },
        { name: 'payoutAddress', type: 'address' },
        { name: 'royaltyBps', type: 'uint96' },
      ],
    }],
    outputs: [{ type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getCollections',
    inputs: [],
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setAgentAllowed',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'CollectionDeployed',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'collection', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'baseURI', type: 'string', indexed: false },
      { name: 'mintPrice', type: 'uint256', indexed: false },
      { name: 'maxSupply', type: 'uint256', indexed: false },
    ],
  },
];

const COLLECTION_ABI = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxSupply',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'mintPrice',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalMinted',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
];

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n🚀 Clawdmint Agents — Collection Deployment\n');

  if (DRY_RUN) console.log('  ⚠️  DRY RUN MODE — No transactions will be sent\n');

  // ── Validate config ──
  if (!FACTORY_ADDRESS) { console.error('ERROR: NEXT_PUBLIC_FACTORY_ADDRESS not set'); process.exit(1); }
  if (!PRIVATE_KEY) { console.error('ERROR: DEPLOYER_PRIVATE_KEY not set'); process.exit(1); }
  if (!TREASURY) { console.error('ERROR: TREASURY_ADDRESS not set'); process.exit(1); }

  // ── Setup clients ──
  const chain = CHAIN_ID === 8453 ? base : baseSepolia;
  const rpcUrl = ALCHEMY_ID
    ? `https://${CHAIN_ID === 8453 ? 'base-mainnet' : 'base-sepolia'}.g.alchemy.com/v2/${ALCHEMY_ID}`
    : CHAIN_ID === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org';

  const formattedKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  const account = privateKeyToAccount(formattedKey);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  console.log(`  Chain:    ${chain.name} (${CHAIN_ID})`);
  console.log(`  Factory:  ${FACTORY_ADDRESS}`);
  console.log(`  Deployer: ${account.address}`);
  console.log(`  Treasury: ${TREASURY}`);

  // ── Check balance ──
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`  Balance:  ${formatEther(balance)} ETH`);

  if (balance < parseEther('0.01')) {
    console.error('\n  ⚠️  WARNING: Low balance. Deployment needs ~0.005-0.01 ETH for gas.');
  }

  // ── Check allowlist ──
  const isAllowed = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'isAgentAllowed',
    args: [account.address],
  });

  console.log(`  Allowlist: ${isAllowed ? '✅ Approved' : '❌ Not approved'}`);

  if (!isAllowed) {
    console.log('\n  Adding deployer to allowlist...');
    if (!DRY_RUN) {
      const hash = await walletClient.writeContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'setAgentAllowed',
        args: [account.address, true],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✅ Added to allowlist (tx: ${hash})`);
    } else {
      console.log('  [DRY RUN] Would add to allowlist');
    }
  }

  // ── Set baseURI ──
  // Pre-reveal: server-hosted placeholder metadata
  // On reveal: switch to server-hosted revealed metadata
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clawdmint.xyz';
  const baseURI = `${APP_URL}/api/metadata/placeholder/`;
  console.log(`\n  📋 Pre-reveal baseURI: ${baseURI}`);
  console.log(`  📋 Reveal baseURI:     ${APP_URL}/agents-data/`);

  // ── Deploy collection ──
  console.log('\n── Deploying Collection ──');
  console.log(`  Name:     ${COLLECTION_NAME}`);
  console.log(`  Symbol:   ${COLLECTION_SYMBOL}`);
  console.log(`  Supply:   ${MAX_SUPPLY}`);
  console.log(`  Price:    ${formatEther(MINT_PRICE)} ETH`);
  console.log(`  Royalty:  ${Number(ROYALTY_BPS) / 100}%`);
  console.log(`  BaseURI:  ${baseURI}`);
  console.log(`  Payout:   ${TREASURY}`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Would call Factory.deployCollection()');
    console.log('\n✅ Dry run complete. Remove --dry-run to deploy.\n');
    return;
  }

  console.log('\n  ⏳ Sending transaction...');

  const hash = await walletClient.writeContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'deployCollection',
    args: [{
      name: COLLECTION_NAME,
      symbol: COLLECTION_SYMBOL,
      baseURI: baseURI,
      maxSupply: MAX_SUPPLY,
      mintPrice: MINT_PRICE,
      payoutAddress: TREASURY,
      royaltyBps: ROYALTY_BPS,
    }],
  });

  console.log(`  📝 Transaction: ${hash}`);
  console.log('  ⏳ Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);

  // ── Find collection address ──
  let collectionAddress;

  // Try to find from events
  for (const log of receipt.logs) {
    if (log.topics.length >= 3) {
      const potentialAddr = '0x' + log.topics[2]?.slice(26);
      if (potentialAddr && potentialAddr.length === 42 && potentialAddr !== FACTORY_ADDRESS.toLowerCase()) {
        collectionAddress = potentialAddr;
        break;
      }
    }
  }

  // Fallback: get latest collection from factory
  if (!collectionAddress) {
    const collections = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'getCollections',
    });
    collectionAddress = collections[collections.length - 1];
  }

  console.log(`\n  🎉 Collection deployed at: ${collectionAddress}`);

  // ── Set mint start time (2 hours from now) ──
  const COUNTDOWN_HOURS = 2;
  const mintStartTime = BigInt(Math.floor(Date.now() / 1000) + COUNTDOWN_HOURS * 3600);
  console.log(`\n  ⏳ Setting mint start time: ${new Date(Number(mintStartTime) * 1000).toISOString()}`);
  console.log(`     (${COUNTDOWN_HOURS} hours from now)`);

  const startTimeHash = await walletClient.writeContract({
    address: collectionAddress,
    abi: [{
      type: 'function',
      name: 'setMintStartTime',
      inputs: [{ name: '_startTime', type: 'uint256' }],
      outputs: [],
      stateMutability: 'nonpayable',
    }],
    functionName: 'setMintStartTime',
    args: [mintStartTime],
  });
  await publicClient.waitForTransactionReceipt({ hash: startTimeHash });
  console.log(`  ✅ Mint start time set (tx: ${startTimeHash})`);

  // ── Verify collection ──
  const [name, maxSupply, mintPrice, totalMinted] = await Promise.all([
    publicClient.readContract({ address: collectionAddress, abi: COLLECTION_ABI, functionName: 'name' }),
    publicClient.readContract({ address: collectionAddress, abi: COLLECTION_ABI, functionName: 'maxSupply' }),
    publicClient.readContract({ address: collectionAddress, abi: COLLECTION_ABI, functionName: 'mintPrice' }),
    publicClient.readContract({ address: collectionAddress, abi: COLLECTION_ABI, functionName: 'totalMinted' }),
  ]);

  console.log(`  ✅ Name: ${name}`);
  console.log(`  ✅ Max Supply: ${maxSupply}`);
  console.log(`  ✅ Mint Price: ${formatEther(mintPrice)} ETH`);
  console.log(`  ✅ Total Minted: ${totalMinted}`);

  // ── Save deployment info ──
  const deployment = {
    collectionAddress,
    txHash: hash,
    blockNumber: Number(receipt.blockNumber),
    chain: chain.name,
    chainId: CHAIN_ID,
    factoryAddress: FACTORY_ADDRESS,
    deployer: account.address,
    name: COLLECTION_NAME,
    symbol: COLLECTION_SYMBOL,
    maxSupply: MAX_SUPPLY.toString(),
    mintPrice: formatEther(MINT_PRICE),
    royaltyBps: Number(ROYALTY_BPS),
    baseURI,
    payout: TREASURY,
    mintStartTime: Number(mintStartTime),
    mintStartTimeISO: new Date(Number(mintStartTime) * 1000).toISOString(),
    countdownHours: COUNTDOWN_HOURS,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(DEPLOY_FILE, JSON.stringify(deployment, null, 2));

  const explorer = CHAIN_ID === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org';

  console.log('\n═══════════════════════════════════════════════');
  console.log('🎉 Deployment Complete!\n');
  console.log(`  Collection: ${collectionAddress}`);
  console.log(`  Explorer:   ${explorer}/address/${collectionAddress}`);
  console.log(`  TX:         ${explorer}/tx/${hash}`);
  console.log(`\n  📁 Deployment info saved to: ${DEPLOY_FILE}`);
  console.log('\n  Next steps:');
  console.log('  1. Upload to IPFS: node scripts/upload-to-ipfs.js');
  console.log('  2. Update site with collection address');
  console.log('  3. When sold out: call setBaseURI with reveal URI');
  console.log('  4. Then call freezeMetadata to lock permanently\n');
}

main().catch(e => {
  console.error('\n❌ Deployment failed:', e.message || e);
  process.exit(1);
});
