import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { SOLANA_COLLECTION_CHAINS } from "@/lib/collection-chains";
import { METAPLEX_MINT_ENGINE, fetchMetaplexCandyMachineState } from "@/lib/metaplex-core-candy-machine";
import { calculateSolanaMintTotalWithFee, getPlatformFeeBps, getSolanaPlatformFeeRecipient } from "@/lib/platform-fees";
import { getLaunchSolanaConnection } from "@/lib/synapse-sap";

const PROFILE_MINT_SCAN_LIMIT = 25;

function getParsedTransactionSignerKeys(
  transaction: Awaited<ReturnType<ReturnType<typeof getLaunchSolanaConnection>["getParsedTransaction"]>>
): string[] {
  if (!transaction) {
    return [];
  }

  return transaction.transaction.message.accountKeys
    .filter((account) => account.signer)
    .map((account) => account.pubkey.toBase58());
}

function getParsedTransactionAccountKeys(
  transaction: Awaited<ReturnType<ReturnType<typeof getLaunchSolanaConnection>["getParsedTransaction"]>>
): string[] {
  if (!transaction) {
    return [];
  }

  return transaction.transaction.message.accountKeys.map((account) => account.pubkey.toBase58());
}

export async function syncRecentMetaplexMintsForWallet(walletAddress: string) {
  const platformFeeRecipient = getSolanaPlatformFeeRecipient();
  const platformFeeBps = platformFeeRecipient ? getPlatformFeeBps() : 0;
  const connection = getLaunchSolanaConnection();
  const signatures = await connection.getSignaturesForAddress(new PublicKey(walletAddress), {
    limit: PROFILE_MINT_SCAN_LIMIT,
  });

  for (const signatureInfo of signatures) {
    if (!signatureInfo.signature || signatureInfo.err) {
      continue;
    }

    const existingMint = await prisma.mint.findUnique({
      where: { txHash: signatureInfo.signature },
      select: { id: true },
    });

    if (existingMint) {
      continue;
    }

    const parsedTransaction = await connection.getParsedTransaction(signatureInfo.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!parsedTransaction || parsedTransaction.meta?.err) {
      continue;
    }

    const signerKeys = getParsedTransactionSignerKeys(parsedTransaction);
    if (!signerKeys.includes(walletAddress)) {
      continue;
    }

    const accountKeys = getParsedTransactionAccountKeys(parsedTransaction);
    const collection = await prisma.collection.findFirst({
      where: {
        mintEngine: METAPLEX_MINT_ENGINE,
        chain: { in: SOLANA_COLLECTION_CHAINS },
        address: { in: accountKeys },
        mintAddress: { in: accountKeys },
      },
      select: {
        id: true,
        address: true,
        mintAddress: true,
        mintPrice: true,
      },
    });

    if (!collection || !collection.mintAddress) {
      continue;
    }

    const assetAddresses = signerKeys.filter((key) => key !== walletAddress);
    if (assetAddresses.length === 0) {
      continue;
    }

    const onchainState = await fetchMetaplexCandyMachineState(collection.mintAddress);
    const quantity = assetAddresses.length;
    const endTokenId = onchainState.itemsRedeemed;
    const startTokenId = Math.max(1, endTokenId - quantity + 1);
    const mintedAt = signatureInfo.blockTime
      ? new Date(signatureInfo.blockTime * 1000)
      : new Date();

    await prisma.mint.create({
      data: {
        collectionId: collection.id,
        minterAddress: walletAddress,
        quantity,
        totalPaid: calculateSolanaMintTotalWithFee(
          BigInt(collection.mintPrice) * BigInt(quantity),
          platformFeeBps
        ).toString(),
        txHash: signatureInfo.signature,
        startTokenId,
        endTokenId,
        assetAddresses: JSON.stringify(assetAddresses),
        mintedAt,
      },
    }).catch(() => null);
  }
}
