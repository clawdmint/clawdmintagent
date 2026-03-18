import { z } from "zod";
import { prisma } from "./db";
import {
  buildCollectionBagsView,
  buildAutomaticBagsDefaults,
  getCollectionBagsFeeShares,
  parseCollectionBagsConfig,
  prepareCollectionBagsRecord,
} from "./collection-bags";
import {
  createBagsFeeShareConfig,
  createBagsLaunchTransaction,
  createBagsTokenInfo,
  fetchBagsCollectionAnalytics,
  lookupBagsFeeShareWallet,
} from "./bags";
import { getEnv } from "./env";
import { getSolanaConnection } from "./solana-collections";
import { isBagsLaunchSupportedChain, normalizeCollectionChain } from "./collection-chains";

export const PrepareCollectionBagsSchema = z.object({
  collection_id: z.string().min(1),
});

export const ConfirmCollectionBagsSchema = z.object({
  collection_id: z.string().min(1),
  token_address: z.string().min(1).optional(),
  launch_tx_hash: z.string().min(1),
  config_key: z.string().min(1).optional(),
});

export type PrepareCollectionBagsInput = z.infer<typeof PrepareCollectionBagsSchema>;
export type ConfirmCollectionBagsInput = z.infer<typeof ConfirmCollectionBagsSchema>;

export class CollectionBagsLaunchError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "CollectionBagsLaunchError";
    this.status = status;
    this.details = details;
  }
}

function getParsedTransactionSignerKeys(
  transaction: Awaited<ReturnType<ReturnType<typeof getSolanaConnection>["getParsedTransaction"]>>
): string[] {
  if (!transaction) {
    return [];
  }

  return transaction.transaction.message.accountKeys
    .filter((account) => account.signer)
    .map((account) => account.pubkey.toBase58());
}

async function resolveFeeShareWallets(collectionId: string, feeShares: ReturnType<typeof getCollectionBagsFeeShares>) {
  const resolved = [];

  for (const feeShare of feeShares) {
    if (feeShare.provider === "wallet") {
      resolved.push(feeShare);
      continue;
    }

    if (!feeShare.username) {
      throw new CollectionBagsLaunchError(400, `${feeShare.label} username is missing`);
    }

    const wallet = await lookupBagsFeeShareWallet({
      provider: feeShare.provider,
      username: feeShare.username,
    });

    resolved.push({
      ...feeShare,
      wallet,
    });
  }

  return resolved;
}

export async function prepareCollectionBagsLaunch(agentId: string, input: PrepareCollectionBagsInput) {
  let collection = await prisma.collection.findFirst({
    where: {
      id: input.collection_id,
      agentId,
    },
  });

  if (!collection) {
    throw new CollectionBagsLaunchError(404, "Collection not found");
  }

  if (!isBagsLaunchSupportedChain(collection.chain)) {
    throw new CollectionBagsLaunchError(
      409,
      "Bags launch is only supported on Solana mainnet-beta right now"
    );
  }

  if (collection.bagsStatus === "DISABLED") {
    const automaticConfig = buildAutomaticBagsDefaults({
      collectionName: collection.name,
      collectionSymbol: collection.symbol,
      imageUrl: collection.imageUrl,
    });
    const preparedRecord = prepareCollectionBagsRecord({
      input: automaticConfig,
      chain: normalizeCollectionChain(collection.chain),
      authorityAddress: collection.authorityAddress || null,
      payoutAddress: collection.payoutAddress,
      collectionName: collection.name,
      collectionSymbol: collection.symbol,
    });

    collection = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        bagsStatus: preparedRecord.bagsStatus,
        bagsTokenAddress: preparedRecord.bagsTokenAddress,
        bagsTokenName: preparedRecord.bagsTokenName,
        bagsTokenSymbol: preparedRecord.bagsTokenSymbol,
        bagsMintAccess: preparedRecord.bagsMintAccess,
        bagsMinTokenBalance: preparedRecord.bagsMinTokenBalance,
        bagsFeeConfig: preparedRecord.bagsFeeConfig,
        bagsCreatorWallet: preparedRecord.bagsCreatorWallet,
        bagsInitialBuyLamports: preparedRecord.bagsInitialBuyLamports,
      },
    });
  }

  const config = parseCollectionBagsConfig(collection.bagsFeeConfig);
  if (!config || !collection.bagsCreatorWallet || !collection.bagsTokenName || !collection.bagsTokenSymbol) {
    throw new CollectionBagsLaunchError(400, "Bags community configuration is incomplete");
  }

  const feeShares = getCollectionBagsFeeShares(config, collection.bagsCreatorWallet);
  const resolvedFeeShares = await resolveFeeShareWallets(collection.id, feeShares);
  const collectionUrl =
    collection.address.startsWith("pending_")
      ? `${getEnv("NEXT_PUBLIC_APP_URL", "https://clawdmint.xyz")}/drops`
      : `${getEnv("NEXT_PUBLIC_APP_URL", "https://clawdmint.xyz")}/collection/${collection.address}`;

  const tokenInfo = await createBagsTokenInfo({
    name: collection.bagsTokenName,
    symbol: collection.bagsTokenSymbol,
    image: config.imageUrl || collection.imageUrl || "",
    description:
      collection.description ||
      `${collection.name} community token launched around an AI-curated NFT collection on Clawdmint.`,
    website: config.websiteUrl || collectionUrl,
    twitter: config.twitterUrl,
    telegram: config.telegramUrl,
  });

  const feeConfig = await createBagsFeeShareConfig({
    payer: collection.bagsCreatorWallet,
    baseMint: tokenInfo.tokenMint,
    feeShares: resolvedFeeShares,
    partnerWallet: config.partnerWallet,
    partnerConfig: config.partnerConfig,
  });

  const launchTransaction = await createBagsLaunchTransaction({
    tokenMint: tokenInfo.tokenMint,
    tokenMetadata: tokenInfo.tokenMetadata,
    ipfs: tokenInfo.ipfs || tokenInfo.metadataUri,
    wallet: collection.bagsCreatorWallet,
    configKey: feeConfig.configKey,
    initialBuyLamports: collection.bagsInitialBuyLamports || config.initialBuyLamports,
  });

  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: {
      bagsStatus: "PREPARED",
      bagsTokenAddress: tokenInfo.tokenMint,
      bagsTokenMetadata: tokenInfo.metadataUri || collection.bagsTokenMetadata,
      bagsConfigKey: feeConfig.configKey,
    },
  });

  return {
    collection: updated,
    bags: buildCollectionBagsView(updated),
    token_info: tokenInfo,
    fee_config: {
      config_key: feeConfig.configKey,
      transactions: feeConfig.transactions,
      transactions_base64: feeConfig.transactionsBase64,
      transaction_bundle_ids: feeConfig.transactionBundleIds,
      resolved_fee_shares: resolvedFeeShares,
    },
    launch: {
      wallet: collection.bagsCreatorWallet,
      transaction: launchTransaction.transaction,
      transaction_base64: launchTransaction.transactionBase64,
      initial_buy_lamports: collection.bagsInitialBuyLamports || config.initialBuyLamports,
    },
  };
}

export async function confirmCollectionBagsLaunch(agentId: string, input: ConfirmCollectionBagsInput) {
  const collection = await prisma.collection.findFirst({
    where: {
      id: input.collection_id,
      agentId,
    },
  });

  if (!collection) {
    throw new CollectionBagsLaunchError(404, "Collection not found");
  }

  const connection = getSolanaConnection();
  const status = await connection.getSignatureStatus(input.launch_tx_hash, {
    searchTransactionHistory: true,
  });

  if (!status.value || status.value.err || !status.value.confirmationStatus) {
    throw new CollectionBagsLaunchError(400, "Bags launch signature is not confirmed");
  }

  if (!collection.bagsCreatorWallet) {
    throw new CollectionBagsLaunchError(400, "Collection Bags creator wallet is not configured");
  }

  const transaction = await connection.getParsedTransaction(input.launch_tx_hash, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const signerKeys = getParsedTransactionSignerKeys(transaction);
  if (!signerKeys.includes(collection.bagsCreatorWallet)) {
    throw new CollectionBagsLaunchError(400, "Bags launch signature was not signed by the creator wallet");
  }

  const tokenAddress = input.token_address || collection.bagsTokenAddress;
  if (!tokenAddress) {
    throw new CollectionBagsLaunchError(400, "Token address is required");
  }

  let analytics = null;
  try {
    analytics = await fetchBagsCollectionAnalytics(tokenAddress);
  } catch (error) {
    console.warn("[Bags] Initial analytics fetch failed:", error);
  }

  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: {
      bagsStatus: "LIVE",
      bagsTokenAddress: tokenAddress,
      bagsLaunchTxHash: input.launch_tx_hash,
      bagsConfigKey: input.config_key || collection.bagsConfigKey,
      bagsLifetimeFees: analytics?.lifetimeFeesLamports || collection.bagsLifetimeFees,
      bagsClaimedFees: analytics?.claimedFeesLamports || collection.bagsClaimedFees,
      bagsScore: analytics?.score || collection.bagsScore,
      bagsAnalyticsUpdatedAt: analytics ? new Date() : collection.bagsAnalyticsUpdatedAt,
    },
  });

  return {
    collection: updated,
    bags: buildCollectionBagsView(updated),
  };
}
