#!/usr/bin/env node
/**
 * Team Allocation: Mint 200 NFTs to the deployer wallet
 * 
 * Strategy: Since payoutAddress and platformTreasury are both the deployer,
 * we can mint in cycles: mint → withdraw → repeat. Only gas is consumed.
 */
require('dotenv').config();
const {
  createPublicClient, createWalletClient, http,
  formatEther, parseAbi,
} = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const CONTRACT = '0x8641aa95cb2913bde395cdc8d802404d6eeecd0a';
const TOTAL_TARGET = 200;
const BATCH_SIZE = 10;
const MINT_PRICE = BigInt('500000000000000'); // 0.0005 ETH

const abi = parseAbi([
  'function publicMint(uint256 quantity) payable',
  'function withdraw()',
  'function totalMinted() view returns (uint256)',
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const rpc = process.env.ALCHEMY_BASE_RPC;
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpc || !pk) throw new Error('Missing ALCHEMY_BASE_RPC or DEPLOYER_PRIVATE_KEY');

  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  const transport = http(rpc);
  const publicClient = createPublicClient({ chain: base, transport });
  const walletClient = createWalletClient({ account, chain: base, transport });

  // Check already minted
  const alreadyMinted = Number(await publicClient.readContract({
    address: CONTRACT, abi, functionName: 'totalMinted',
  }));
  
  const targetRemaining = TOTAL_TARGET - alreadyMinted;
  
  console.log(`\n  Team Allocation Minter`);
  console.log(`  Address: ${account.address}`);
  console.log(`  Already minted: ${alreadyMinted}`);
  console.log(`  Target: ${TOTAL_TARGET} (remaining: ${targetRemaining})\n`);
  
  if (targetRemaining <= 0) {
    console.log(`  Already at target! Done.`);
    return;
  }

  let teamMinted = 0;
  let failCount = 0;

  while (teamMinted < targetRemaining && failCount < 5) {
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`  Balance: ${formatEther(balance)} ETH | Progress: ${alreadyMinted + teamMinted}/${TOTAL_TARGET}`);

    const gasReserve = BigInt('300000000000000'); // 0.0003 ETH
    const available = balance > gasReserve ? balance - gasReserve : BigInt(0);
    const maxAfford = Number(available / MINT_PRICE);
    const remaining = targetRemaining - teamMinted;

    if (maxAfford < 1) {
      // Need to withdraw from contract
      const contractBal = await publicClient.getBalance({ address: CONTRACT });
      if (contractBal === BigInt(0)) {
        console.log(`  ❌ No funds anywhere. Need more ETH.`);
        break;
      }
      console.log(`  Low balance. Withdrawing ${formatEther(contractBal)} ETH from contract...`);
      try {
        const wh = await walletClient.writeContract({
          address: CONTRACT, abi, functionName: 'withdraw', gas: BigInt(100000),
        });
        await publicClient.waitForTransactionReceipt({ hash: wh });
        console.log(`  ✅ Withdrawn!`);
        await sleep(1500);
        continue;
      } catch (e) {
        console.log(`  ❌ Withdraw failed: ${e.shortMessage || e.message}`);
        failCount++;
        await sleep(2000);
        continue;
      }
    }

    const batchQty = Math.min(BATCH_SIZE, maxAfford, remaining);
    const value = MINT_PRICE * BigInt(batchQty);

    console.log(`  Minting ${batchQty}...`);
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT, abi, functionName: 'publicMint',
        args: [BigInt(batchQty)], value, gas: BigInt(50000) * BigInt(batchQty) + BigInt(50000),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        teamMinted += batchQty;
        failCount = 0;
        console.log(`  ✅ Minted! (gas: ${formatEther(receipt.gasUsed * receipt.effectiveGasPrice)} ETH)`);
      } else {
        console.log(`  ❌ Tx reverted!`);
        failCount++;
      }
    } catch (e) {
      console.log(`  ❌ Mint error: ${e.shortMessage || e.message}`);
      failCount++;
      await sleep(2000);
    }

    await sleep(1000); // Rate limit

    // Withdraw every 30 mints to recycle
    if (teamMinted > 0 && teamMinted % 20 === 0 && teamMinted < targetRemaining) {
      const contractBal = await publicClient.getBalance({ address: CONTRACT });
      if (contractBal > BigInt(0)) {
        console.log(`  Recycling ${formatEther(contractBal)} ETH...`);
        try {
          const wh = await walletClient.writeContract({
            address: CONTRACT, abi, functionName: 'withdraw', gas: BigInt(100000),
          });
          await publicClient.waitForTransactionReceipt({ hash: wh });
          console.log(`  ✅ Recycled!`);
          await sleep(1500);
        } catch { /* continue */ }
      }
    }
  }

  const finalMinted = Number(await publicClient.readContract({
    address: CONTRACT, abi, functionName: 'totalMinted',
  }));
  const finalBal = await publicClient.getBalance({ address: account.address });
  
  console.log(`\n  ═══════════════════════════════`);
  console.log(`  Session minted: ${teamMinted}`);
  console.log(`  Total on-chain: ${finalMinted}`);
  console.log(`  Final balance: ${formatEther(finalBal)} ETH`);
  console.log(`  ═══════════════════════════════\n`);
}

main().catch(console.error);
