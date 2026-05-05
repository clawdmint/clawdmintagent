/**
 * Read-only cPEG token audit.
 *
 * Checks that a launched mint is a Token-2022 mint, has the cPEG transfer hook,
 * has the expected collection + validation PDAs, and that sampled holder
 * OwnerPeg capacity does not exceed the live whole-token balance.
 *
 * Run:
 *   npx ts-node scripts/cpeg-token-audit.ts <mint> [mint...]
 *
 * No signatures, no keypairs, no secrets.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import {
  AccountLayout,
  TOKEN_2022_PROGRAM_ID,
  getMetadataPointerState,
  getMint,
  getTransferHook,
} from "@solana/spl-token";

const DEFAULT_RPC_URL = process.env["CLAWPEG_RPC_URL"] || "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID =
  process.env["CLAWPEG_PROGRAM_ID"] ||
  process.env["NEXT_PUBLIC_CLAWPEG_PROGRAM_ID"] ||
  "AfL9FC6ZzHXF2QBgyJ5vCNs3i8sVM8fJwZDuyHTNCE6X";

function derivePda(
  programId: InstanceType<typeof PublicKey>,
  seed: string,
  ...keys: Array<InstanceType<typeof PublicKey>>
) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), ...keys.map((key) => key.toBuffer())], programId)[0];
}

function readPubkey(data: Buffer, offset: number) {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function parseCollection(data: Buffer) {
  return {
    pegUnit: data.readBigUInt64LE(131),
    maxPegs: data.readUInt32LE(139),
    totalPegs: data.readUInt32LE(143),
    burnedPegs: data.readUInt32LE(147),
    royaltyBps: data.readUInt16LE(159),
    marketplaceFeeBps: data.readUInt16LE(161),
    decimals: data.readUInt8(227),
  };
}

function parseOwnerPeg(data: Buffer) {
  return {
    initialized: data.readUInt8(0) === 1,
    collection: readPubkey(data, 2),
    owner: readPubkey(data, 34),
    syncedCapacity: data.readUInt32LE(66),
    activeCount: data.readUInt32LE(70),
    generation: data.readUInt32LE(74),
    lastSyncedSlot: data.readBigUInt64LE(78).toString(),
  };
}

async function auditMint(
  connection: InstanceType<typeof Connection>,
  programId: InstanceType<typeof PublicKey>,
  mint: InstanceType<typeof PublicKey>
) {
  const mintAccount = await connection.getAccountInfo(mint, "confirmed");
  const result: Record<string, unknown> = {
    mint: mint.toBase58(),
    accountExists: Boolean(mintAccount),
    accountOwner: mintAccount?.owner.toBase58() || null,
    isToken2022: mintAccount?.owner.equals(TOKEN_2022_PROGRAM_ID) || false,
  };

  if (!mintAccount) return result;

  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const transferHook = getTransferHook(mintInfo);
  const metadataPointer = getMetadataPointerState(mintInfo);
  const collection = derivePda(programId, "cpeg", mint);
  const validation = derivePda(programId, "extra-account-metas", mint);
  const [collectionInfo, validationInfo] = await connection.getMultipleAccountsInfo(
    [collection, validation],
    "confirmed"
  );
  const collectionState = collectionInfo ? parseCollection(Buffer.from(collectionInfo.data)) : null;

  const largest = await connection.getTokenLargestAccounts(mint, "confirmed");
  const tokenAccounts = largest.value.map((row: (typeof largest.value)[number]) => row.address);
  const tokenInfos = await connection.getMultipleAccountsInfo(tokenAccounts, "confirmed");
  const sampledHolders = [];

  for (let index = 0; index < tokenAccounts.length; index += 1) {
    const tokenInfo = tokenInfos[index];
    if (!tokenInfo) continue;

    const decoded = AccountLayout.decode(tokenInfo.data.subarray(0, AccountLayout.span));
    const rawAmount = BigInt(decoded.amount.toString());
    const owner = new PublicKey(decoded.owner);
    const ownerPeg = derivePda(programId, "owner-peg", collection, owner);
    const ownerPegInfo = await connection.getAccountInfo(ownerPeg, "confirmed");
    const ownerPegState = ownerPegInfo ? parseOwnerPeg(Buffer.from(ownerPegInfo.data)) : null;
    const wholeCapacity = collectionState ? Number(rawAmount / collectionState.pegUnit) : null;

    sampledHolders.push({
      tokenAccount: tokenAccounts[index].toBase58(),
      owner: owner.toBase58(),
      rawAmount: rawAmount.toString(),
      uiAmount: largest.value[index].uiAmountString,
      wholeCapacity,
      ownerPeg: ownerPeg.toBase58(),
      ownerPegExists: Boolean(ownerPegInfo),
      syncedCapacity: ownerPegState?.syncedCapacity ?? null,
      activeCount: ownerPegState?.activeCount ?? null,
      generation: ownerPegState?.generation ?? null,
      capacityMatches: ownerPegState && wholeCapacity !== null ? ownerPegState.syncedCapacity === wholeCapacity : false,
      activeWithinCapacity: ownerPegState && wholeCapacity !== null ? ownerPegState.activeCount <= wholeCapacity : false,
    });
  }

  return {
    ...result,
    supply: mintInfo.supply.toString(),
    decimals: mintInfo.decimals,
    mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
    freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
    transferHookProgramId: transferHook?.programId?.toBase58() || null,
    transferHookAuthority: transferHook?.authority?.toBase58() || null,
    hookMatchesProgram: transferHook?.programId?.equals(programId) || false,
    metadataPointerAuthority: metadataPointer?.authority?.toBase58() || null,
    metadataAddress: metadataPointer?.metadataAddress?.toBase58() || null,
    collection: collection.toBase58(),
    collectionExists: Boolean(collectionInfo),
    collectionOwner: collectionInfo?.owner.toBase58() || null,
    collectionState: collectionState
      ? {
          ...collectionState,
          pegUnit: collectionState.pegUnit.toString(),
        }
      : null,
    validation: validation.toBase58(),
    validationExists: Boolean(validationInfo),
    validationOwner: validationInfo?.owner.toBase58() || null,
    validationDataLength: validationInfo?.data.length || 0,
    sampledHolders,
  };
}

async function main() {
  const mints = process.argv.slice(2);
  if (!mints.length) {
    throw new Error("Provide at least one mint address.");
  }

  const connection = new Connection(DEFAULT_RPC_URL, "confirmed");
  const programId = new PublicKey(DEFAULT_PROGRAM_ID);
  const results = [];

  for (const mint of mints) {
    results.push(await auditMint(connection, programId, new PublicKey(mint)));
  }

  console.log(JSON.stringify({ rpcUrl: DEFAULT_RPC_URL, programId: programId.toBase58(), results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
