#!/usr/bin/env node
/**
 * Airdrop: Send 1 Clawdmint Agents NFT to each $CLAWDMINT token holder
 * 
 * Steps:
 * 1. Fetch all $CLAWDMINT token holders from Basescan API
 * 2. Filter out deployer, dead addresses, and contracts
 * 3. Check deployer NFT balance
 * 4. Transfer 1 NFT to each holder
 */
require("dotenv").config();
const {
  createPublicClient, createWalletClient, http,
  formatEther, parseAbi,
} = require("viem");
const { base } = require("viem/chains");
const { privateKeyToAccount } = require("viem/accounts");

const CLAWDMINT_TOKEN = "0x6845307b66427164fe68f6734f0411d4434bcb07";
const AGENTS_NFT = "0x8641aa95cb2913bde395cdc8d802404d6eeecd0a";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "1WMRSZQ7NV5ZGPKQ51PBB97WFIU6IUERZ7";

// Known addresses to exclude (deployer, treasury, LP pools, dead addresses)
const EXCLUDE = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

const nftAbi = parseAbi([
  "function publicMint(uint256 quantity) payable",
  "function totalMinted() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchHolders() {
  // Use Etherscan V2 API to get all transfer events and derive unique addresses
  const allAddresses = new Set();
  let page = 1;
  
  while (true) {
    const url = `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&contractaddress=${CLAWDMINT_TOKEN}&page=${page}&offset=1000&sort=asc&apikey=${BASESCAN_API_KEY}`;
    console.log(`  Fetching: ${url.slice(0, 80)}...`);
    const res = await globalThis.fetch(url);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { console.log("  Parse error:", text.slice(0, 200)); break; }
    console.log(`  API response: status=${data.status}, message=${data.message}, results=${Array.isArray(data.result) ? data.result.length : String(data.result).slice(0, 200)}`);
    
    if (data.status !== "1" || !Array.isArray(data.result) || data.result.length === 0) break;
    
    for (const tx of data.result) {
      if (tx.to) allAddresses.add(tx.to.toLowerCase());
      if (tx.from) allAddresses.add(tx.from.toLowerCase());
    }
    
    console.log(`  Page ${page}: ${data.result.length} transfers, ${allAddresses.size} unique addresses`);
    
    if (data.result.length < 1000) break;
    page++;
    await sleep(300);
  }
  
  if (allAddresses.size === 0) {
    throw new Error("Could not fetch any transfer events");
  }
  
  return Array.from(allAddresses).map(a => ({ address: a, balance: "0" }));
}

async function main() {
  const rpc = process.env.ALCHEMY_BASE_RPC;
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpc || !pk) throw new Error("Missing ALCHEMY_BASE_RPC or DEPLOYER_PRIVATE_KEY");

  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  const transport = http(rpc);
  const publicClient = createPublicClient({ chain: base, transport });
  const walletClient = createWalletClient({ account, chain: base, transport });

  const deployerAddr = account.address.toLowerCase();
  EXCLUDE.add(deployerAddr);

  console.log("\n  ═══════════════════════════════════════════");
  console.log("  $CLAWDMINT Holder Airdrop — Clawdmint Agents NFT");
  console.log("  ═══════════════════════════════════════════");
  console.log(`  Deployer: ${account.address}`);

  // Step 1: Get holders
  console.log("\n  [1/4] Fetching $CLAWDMINT token holders...");
  let holders = await fetchHolders();
  console.log(`  Found ${holders.length} addresses from API`);

  // Step 2: Filter -- remove excluded addresses and verify they still hold tokens
  console.log("\n  [2/4] Filtering and verifying holders...");
  const validHolders = [];
  
  for (const h of holders) {
    if (EXCLUDE.has(h.address)) {
      console.log(`  Skip (excluded): ${h.address}`);
      continue;
    }
    
    // Verify they still hold CLAWDMINT tokens
    try {
      const bal = await publicClient.readContract({
        address: CLAWDMINT_TOKEN,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [h.address],
      });
      
      if (bal > BigInt(0)) {
        validHolders.push({
          address: h.address,
          balance: bal,
        });
        const balStr = (Number(bal) / 1e18).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        console.log(`  ✅ ${h.address} — ${balStr} CLAWDMINT`);
      } else {
        console.log(`  Skip (0 balance): ${h.address}`);
      }
    } catch (e) {
      console.log(`  Skip (error): ${h.address} — ${e.shortMessage || e.message}`);
    }
    
    await sleep(200); // Rate limit
  }

  console.log(`\n  Valid holders to airdrop: ${validHolders.length}`);

  if (validHolders.length === 0) {
    console.log("  No valid holders found. Exiting.");
    return;
  }

  // Step 3: Check deployer NFT balance and find available token IDs
  console.log("\n  [3/4] Checking deployer NFT inventory...");
  
  const deployerNftBalance = Number(await publicClient.readContract({
    address: AGENTS_NFT, abi: nftAbi, functionName: "balanceOf",
    args: [account.address],
  }));
  
  const totalMinted = Number(await publicClient.readContract({
    address: AGENTS_NFT, abi: nftAbi, functionName: "totalMinted",
  }));
  
  const mintPrice = await publicClient.readContract({
    address: AGENTS_NFT, abi: nftAbi, functionName: "mintPrice",
  });
  
  console.log(`  Deployer NFT balance: ${deployerNftBalance}`);
  console.log(`  Total NFTs minted: ${totalMinted}`);
  console.log(`  Mint price: ${formatEther(mintPrice)} ETH`);
  console.log(`  Need: ${validHolders.length} NFTs`);

  if (deployerNftBalance < validHolders.length) {
    const needed = validHolders.length - deployerNftBalance;
    console.log(`\n  ⚠ Need to mint ${needed} more NFTs first...`);
    
    const mintCost = mintPrice * BigInt(needed);
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`  Mint cost: ${formatEther(mintCost)} ETH`);
    console.log(`  Wallet balance: ${formatEther(balance)} ETH`);
    
    if (balance < mintCost + BigInt("500000000000000")) {
      console.log(`  ❌ Insufficient ETH for minting + gas`);
      return;
    }

    // Mint in batches of 10
    let minted = 0;
    while (minted < needed) {
      const batchQty = Math.min(10, needed - minted);
      const value = mintPrice * BigInt(batchQty);
      
      console.log(`  Minting ${batchQty} NFTs...`);
      try {
        const hash = await walletClient.writeContract({
          address: AGENTS_NFT, abi: nftAbi, functionName: "publicMint",
          args: [BigInt(batchQty)], value,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "success") {
          minted += batchQty;
          console.log(`  ✅ Minted ${batchQty} (total: ${minted}/${needed})`);
        } else {
          console.log(`  ❌ Mint reverted!`);
          break;
        }
      } catch (e) {
        console.log(`  ❌ Mint error: ${e.shortMessage || e.message}`);
        break;
      }
      await sleep(2000);
    }
  }

  // Step 4: Find deployer-owned token IDs and transfer
  console.log("\n  [4/4] Transferring NFTs to holders...");
  
  // Find deployer-owned token IDs by scanning
  const deployerTokenIds = [];
  for (let tokenId = 1; tokenId <= totalMinted + validHolders.length; tokenId++) {
    try {
      const owner = await publicClient.readContract({
        address: AGENTS_NFT, abi: nftAbi, functionName: "ownerOf",
        args: [BigInt(tokenId)],
      });
      if (owner.toLowerCase() === deployerAddr) {
        deployerTokenIds.push(tokenId);
      }
    } catch {
      // Token doesn't exist yet
    }
    
    if (deployerTokenIds.length >= validHolders.length) break;
    
    // Rate limit every 20 checks
    if (tokenId % 20 === 0) await sleep(300);
  }

  console.log(`  Found ${deployerTokenIds.length} deployer-owned NFTs`);

  if (deployerTokenIds.length < validHolders.length) {
    console.log(`  ❌ Not enough NFTs! Have ${deployerTokenIds.length}, need ${validHolders.length}`);
    return;
  }

  // Transfer!
  let transferred = 0;
  let failed = 0;

  for (let i = 0; i < validHolders.length; i++) {
    const holder = validHolders[i];
    const tokenId = deployerTokenIds[i];
    
    // Check if this holder already has a Clawdmint Agents NFT
    try {
      const nftBal = await publicClient.readContract({
        address: AGENTS_NFT, abi: nftAbi, functionName: "balanceOf",
        args: [holder.address],
      });
      if (nftBal > BigInt(0)) {
        console.log(`  Skip ${holder.address} — already has ${nftBal} NFT(s)`);
        continue;
      }
    } catch { /* proceed */ }

    console.log(`  [${i + 1}/${validHolders.length}] Sending NFT #${tokenId} → ${holder.address}...`);
    
    try {
      const hash = await walletClient.writeContract({
        address: AGENTS_NFT,
        abi: nftAbi,
        functionName: "transferFrom",
        args: [account.address, holder.address, BigInt(tokenId)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === "success") {
        transferred++;
        const gas = formatEther(receipt.gasUsed * receipt.effectiveGasPrice);
        console.log(`  ✅ Transferred! (gas: ${gas} ETH)`);
      } else {
        failed++;
        console.log(`  ❌ Transfer reverted!`);
      }
    } catch (e) {
      failed++;
      console.log(`  ❌ Transfer error: ${e.shortMessage || e.message}`);
    }
    
    await sleep(1500); // Rate limit between transfers
  }

  // Summary
  const finalBal = await publicClient.getBalance({ address: account.address });
  console.log("\n  ═══════════════════════════════════════════");
  console.log(`  AIRDROP COMPLETE`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Transferred: ${transferred}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped (already had NFT): ${validHolders.length - transferred - failed}`);
  console.log(`  Remaining ETH: ${formatEther(finalBal)}`);
  console.log("  ═══════════════════════════════════════════\n");
}

main().catch(console.error);
