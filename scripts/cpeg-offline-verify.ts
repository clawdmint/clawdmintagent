/**
 * Offline verification harness for the cPEG SDK and fee math.
 *
 * Validates that:
 *   - splitClawPegMarketPayment matches the on-chain split logic byte-for-byte.
 *   - buildClawPegBuyPegEscrowManifest emits the exact account list the
 *     cpeg-market program expects, including the trailing creator + fee_vault
 *     accounts required for royalty + protocol fee distribution.
 *   - Owner-peg, peg-record, and listing PDAs derive identically across SDK
 *     usages (sanity for batch-buy / batch-transfer flows).
 *
 * Run with:  npx ts-node scripts/cpeg-offline-verify.ts
 *
 * No RPC, no keys, no secrets. Uses placeholder pubkeys.
 */
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

process.env["CLAWPEG_PROGRAM_ID"] =
  process.env["CLAWPEG_PROGRAM_ID"] || "11111111111111111111111111111112";
process.env["CPEG_MARKET_PROGRAM_ID"] =
  process.env["CPEG_MARKET_PROGRAM_ID"] || "11111111111111111111111111111113";

import {
  buildClawPegBuyPegEscrowManifest,
  buildClawPegCancelPegEscrowManifest,
  buildClawPegListPegEscrowManifest,
  buildClawPegTransferPegManifest,
  findClawPegCollectionAddress,
  findClawPegHookValidationAddress,
  findMarketListingAddress,
  findMarketSaleCounterAddress,
  findOwnerPegAddress,
  findPegRecordAddress,
  findTradeArtRecordAddress,
  splitClawPegMarketPayment,
} from "../src/lib/clawpeg";

const failures: string[] = [];
function expect(condition: boolean, label: string) {
  if (!condition) failures.push(label);
}

function header(title: string) {
  console.log(`\n=== ${title} ===`);
}

header("split fee math");
const noFee = splitClawPegMarketPayment(BigInt(1_000_000_000), 0, 0);
expect(noFee.sellerProceedsLamports === "1000000000", "no-fee seller proceeds");
expect(noFee.creatorRoyaltyLamports === "0", "no-fee royalty");
expect(noFee.protocolFeeLamports === "0", "no-fee protocol");

const standard = splitClawPegMarketPayment(BigInt(1_000_000_000), 200, 200);
expect(standard.creatorRoyaltyLamports === "20000000", "2% royalty");
expect(standard.protocolFeeLamports === "20000000", "2% protocol");
expect(standard.sellerProceedsLamports === "960000000", "96% seller");

const boundary = splitClawPegMarketPayment(BigInt(1_000), 5000, 5000);
expect(boundary.sellerProceedsLamports === "0", "100% bps boundary seller");
expect(boundary.creatorRoyaltyLamports === "500", "100% bps boundary royalty");
expect(boundary.protocolFeeLamports === "500", "100% bps boundary protocol");

let bpsRejected = false;
try {
  splitClawPegMarketPayment(BigInt(100), 6000, 5000);
} catch {
  bpsRejected = true;
}
expect(bpsRejected, "bps total > 10000 rejected");

header("PDA derivations");
const tokenMint = "So11111111111111111111111111111111111111112";
const seller = "11111111111111111111111111111114";
const buyer = "11111111111111111111111111111115";
const creator = "11111111111111111111111111111116";
const feeVault = "11111111111111111111111111111117";

const collectionA = findClawPegCollectionAddress(tokenMint).toBase58();
const collectionB = findClawPegCollectionAddress(tokenMint).toBase58();
expect(collectionA === collectionB, "collection PDA deterministic");

const hookA = findClawPegHookValidationAddress(tokenMint).toBase58();
const hookB = findClawPegHookValidationAddress(tokenMint).toBase58();
expect(hookA === hookB, "hook validation PDA deterministic");

const ownerPegSeller = findOwnerPegAddress(collectionA, seller).toBase58();
const ownerPegBuyer = findOwnerPegAddress(collectionA, buyer).toBase58();
expect(ownerPegSeller !== ownerPegBuyer, "different owners get different owner-pegs");

const peg7 = findPegRecordAddress(collectionA, 7).toBase58();
const peg8 = findPegRecordAddress(collectionA, 8).toBase58();
expect(peg7 !== peg8, "different peg ids get different records");

const listing7 = findMarketListingAddress(collectionA, 7).toBase58();
const listing7Again = findMarketListingAddress(collectionA, 7).toBase58();
expect(listing7 === listing7Again, "listing PDA deterministic");
const saleCounter = findMarketSaleCounterAddress(collectionA).toBase58();
const saleCounterAgain = findMarketSaleCounterAddress(collectionA).toBase58();
expect(saleCounter === saleCounterAgain, "sale-counter PDA deterministic");

header("buy manifest must include creator + fee_vault + sale_counter + trade_art accounts");
const buyManifest = buildClawPegBuyPegEscrowManifest({
  buyer,
  seller,
  creator,
  feeVault,
  tokenMint,
  buyerTokenAccount: SystemProgram.programId.toBase58(),
  escrowTokenAccount: TOKEN_2022_PROGRAM_ID.toBase58(),
  pegId: 7,
  tradeIndex: BigInt(42),
});
expect(buyManifest.accounts.length === 19, `buy ix has 19 accounts (got ${buyManifest.accounts.length})`);
const lastFour = buyManifest.accounts.slice(-4);
expect(lastFour[0].pubkey === creator && lastFour[0].isWritable, "creator account writable & last-3");
expect(lastFour[1].pubkey === feeVault && lastFour[1].isWritable, "fee_vault account writable & last-2");
expect(lastFour[2].pubkey === saleCounter && lastFour[2].isWritable, "sale_counter PDA writable & last-1");
const expectedTradeArt = findTradeArtRecordAddress(collectionA, BigInt(42)).toBase58();
expect(
  lastFour[3].pubkey === expectedTradeArt && lastFour[3].isWritable,
  `trade_art PDA writable & last (got ${lastFour[3].pubkey} expected ${expectedTradeArt})`
);
const buyerEntry = buyManifest.accounts[0];
expect(buyerEntry.pubkey === buyer && buyerEntry.isSigner && buyerEntry.isWritable, "buyer at index 0 signer+writable");
const sellerEntry = buyManifest.accounts[1];
expect(sellerEntry.pubkey === seller && !sellerEntry.isSigner && sellerEntry.isWritable, "seller at index 1 writable");

// Trade-art PDA must be unique per (collection, sale sequence) so every cPEG sale can
// materialize a separate art piece, including repeat sales of the same PEG identity.
const tradeArt7 = findTradeArtRecordAddress(collectionA, BigInt(7)).toBase58();
const tradeArt8 = findTradeArtRecordAddress(collectionA, BigInt(8)).toBase58();
expect(tradeArt7 !== tradeArt8, "different sale indices derive different trade-art PDAs");
const tradeArt7Again = findTradeArtRecordAddress(collectionA, BigInt(7)).toBase58();
expect(tradeArt7 === tradeArt7Again, "trade-art PDA derivation is deterministic");

header("list / cancel manifests preserve escrow account ordering");
const listManifest = buildClawPegListPegEscrowManifest({
  seller,
  tokenMint,
  sellerTokenAccount: SystemProgram.programId.toBase58(),
  escrowTokenAccount: TOKEN_2022_PROGRAM_ID.toBase58(),
  pegId: 7,
  priceLamports: BigInt(1_000_000_000),
});
expect(listManifest.accounts.length === 14, `list ix has 14 accounts (got ${listManifest.accounts.length})`);
expect(listManifest.accounts[0].isSigner, "list seller is signer");

const cancelManifest = buildClawPegCancelPegEscrowManifest({
  seller,
  tokenMint,
  sellerTokenAccount: SystemProgram.programId.toBase58(),
  escrowTokenAccount: TOKEN_2022_PROGRAM_ID.toBase58(),
  pegId: 7,
});
expect(cancelManifest.accounts.length === 14, `cancel ix has 14 accounts (got ${cancelManifest.accounts.length})`);

header("transfer manifest covers source + destination owner-peg + peg-record");
const transferManifest = buildClawPegTransferPegManifest({
  sourceOwner: seller,
  destinationOwner: buyer,
  sourceTokenAccount: SystemProgram.programId.toBase58(),
  destinationTokenAccount: TOKEN_2022_PROGRAM_ID.toBase58(),
  tokenMint,
  pegId: 7,
});
expect(transferManifest.accounts.length === 12, `transfer ix has 12 accounts (got ${transferManifest.accounts.length})`);
expect(transferManifest.accounts[0].isSigner, "transfer source is signer");
const sourceOwnerPegEntry = transferManifest.accounts[3];
expect(
  sourceOwnerPegEntry.pubkey === ownerPegSeller && sourceOwnerPegEntry.isWritable,
  "transfer source owner-peg writable"
);
const destinationOwnerPegEntry = transferManifest.accounts[4];
expect(
  destinationOwnerPegEntry.pubkey === ownerPegBuyer && destinationOwnerPegEntry.isWritable,
  "transfer destination owner-peg writable"
);

header("verification summary");
if (!failures.length) {
  console.log("OK - all cPEG offline checks passed.");
} else {
  console.error(`FAIL - ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const _publicKeyDoesNotThrow = new PublicKey(SystemProgram.programId.toBase58());
void _publicKeyDoesNotThrow;
