import "server-only";

import bs58 from "bs58";
import {
  addPlugin,
  approvePluginAuthority,
  fetchAsset,
  fetchCollection,
  mplCore,
  revokePluginAuthority,
  transfer,
} from "@metaplex-foundation/mpl-core";
import {
  createNoopSigner,
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fromWeb3JsInstruction,
  fromWeb3JsKeypair,
  toWeb3JsLegacyTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  Keypair,
  PublicKey as Web3PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getSolanaConnection, getSolanaRpcUrl } from "./solana-collections";

export const MARKETPLACE_LISTING_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function parseSecretKey(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("Marketplace delegate private key is not configured");
  }

  if (trimmed.startsWith("[")) {
    return Uint8Array.from(JSON.parse(trimmed) as number[]);
  }

  return Uint8Array.from(bs58.decode(trimmed));
}

export function getMarketplaceDelegateKeypair() {
  const configured =
    process.env["SOLANA_MARKETPLACE_DELEGATE_PRIVATE_KEY"]?.trim() ||
    process.env["SOLANA_DEPLOYER_PRIVATE_KEY"]?.trim() ||
    "";

  return Keypair.fromSecretKey(parseSecretKey(configured));
}

export function getMarketplaceDelegateAddress() {
  return getMarketplaceDelegateKeypair().publicKey.toBase58();
}

function createClientSigningUmi(walletAddress: string) {
  const umi = createUmi(getSolanaRpcUrl());
  umi.use(mplCore());
  umi.use(signerIdentity(createNoopSigner(publicKey(walletAddress))));
  return umi;
}

async function serializeBuilder(
  umi: ReturnType<typeof createClientSigningUmi>,
  builder: ReturnType<typeof transactionBuilder>
) {
  const builtTransaction = await builder.useLegacyVersion().buildWithLatestBlockhash(umi);
  const web3Transaction = toWeb3JsLegacyTransaction(builtTransaction);
  return Buffer.from(
    web3Transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
  ).toString("base64");
}

export function deserializeMarketplaceTransaction(serializedBase64: string) {
  return Transaction.from(Buffer.from(serializedBase64, "base64"));
}

function serializeSignedMarketplaceTransaction(
  transaction: Transaction,
  additionalSigners: Keypair[] = []
) {
  if (additionalSigners.length > 0) {
    transaction.partialSign(...additionalSigners);
  }

  return Buffer.from(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
  ).toString("base64");
}

type MarketChainContext = {
  asset: Awaited<ReturnType<typeof fetchAsset>>;
  collection: Awaited<ReturnType<typeof fetchCollection>> | null;
};

async function fetchMarketChainContext(input: {
  walletAddress: string;
  assetAddress: string;
  collectionAddress: string;
}): Promise<MarketChainContext> {
  const umi = createClientSigningUmi(input.walletAddress);
  const asset = await fetchAsset(umi, publicKey(input.assetAddress));
  const collection = await fetchCollection(umi, publicKey(input.collectionAddress)).catch(() => null);

  return { asset, collection };
}

function hasMarketplaceTransferDelegate(
  asset: Awaited<ReturnType<typeof fetchAsset>>,
  delegateAddress: string
) {
  const authority = (asset as { transferDelegate?: { authority?: { type?: string; address?: { toString(): string } } } }).transferDelegate?.authority;
  return authority?.type === "Address" && authority.address?.toString() === delegateAddress;
}

function hasTransferDelegatePlugin(asset: Awaited<ReturnType<typeof fetchAsset>>) {
  return Boolean(
    (asset as {
      transferDelegate?: unknown;
    }).transferDelegate
  );
}

export async function buildMarketplaceListingDelegateTransaction(input: {
  walletAddress: string;
  assetAddress: string;
  collectionAddress: string;
}) {
  const umi = createClientSigningUmi(input.walletAddress);
  const walletSigner = createNoopSigner(publicKey(input.walletAddress));
  const delegateAddress = getMarketplaceDelegateAddress();
  const delegateAuthority = {
    type: "Address" as const,
    address: publicKey(delegateAddress),
  };
  const { asset, collection } = await fetchMarketChainContext(input);

  const builder = hasTransferDelegatePlugin(asset)
    ? approvePluginAuthority(umi, {
        asset: asset.publicKey,
        collection: collection?.publicKey,
        payer: walletSigner,
        authority: walletSigner,
        plugin: { type: "TransferDelegate" },
        newAuthority: delegateAuthority,
      })
    : addPlugin(umi, {
        asset: asset.publicKey,
        collection: collection?.publicKey,
        payer: walletSigner,
        authority: walletSigner,
        plugin: {
          type: "TransferDelegate",
          authority: delegateAuthority,
        },
      });

  return {
    serializedTransactionBase64: await serializeBuilder(umi, builder),
    expiresAt: new Date(Date.now() + MARKETPLACE_LISTING_TTL_MS),
    delegateAddress,
  };
}

export async function buildMarketplaceCancelListingTransaction(input: {
  walletAddress: string;
  assetAddress: string;
  collectionAddress: string;
}) {
  const umi = createClientSigningUmi(input.walletAddress);
  const walletSigner = createNoopSigner(publicKey(input.walletAddress));
  const delegateSigner = getMarketplaceDelegateKeypair();
  const delegateAuthoritySigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(delegateSigner));
  const { asset, collection } = await fetchMarketChainContext(input);

  const builder = revokePluginAuthority(umi, {
    asset: asset.publicKey,
    collection: collection?.publicKey,
    payer: walletSigner,
    authority: delegateAuthoritySigner,
    plugin: { type: "TransferDelegate" },
  });

  const builtTransaction = await builder.useLegacyVersion().buildWithLatestBlockhash(umi);
  const web3Transaction = toWeb3JsLegacyTransaction(builtTransaction);

  return {
    serializedTransactionBase64: serializeSignedMarketplaceTransaction(web3Transaction, [delegateSigner]),
  };
}

export async function buildMarketplaceFillTransaction(input: {
  buyerAddress: string;
  sellerAddress: string;
  assetAddress: string;
  collectionAddress: string;
  priceLamports: string;
}) {
  const umi = createClientSigningUmi(input.buyerAddress);
  const buyerSigner = createNoopSigner(publicKey(input.buyerAddress));
  const delegateSigner = getMarketplaceDelegateKeypair();
  const delegateAddress = delegateSigner.publicKey.toBase58();
  const delegateAuthoritySigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(delegateSigner));
  const { asset, collection } = await fetchMarketChainContext({
    walletAddress: input.buyerAddress,
    assetAddress: input.assetAddress,
    collectionAddress: input.collectionAddress,
  });

  if (!hasMarketplaceTransferDelegate(asset, delegateAddress)) {
    throw new Error("Marketplace transfer delegate is not active for this asset");
  }

  let builder = transactionBuilder().useLegacyVersion();
  builder = builder.add({
    instruction: fromWeb3JsInstruction(
      SystemProgram.transfer({
        fromPubkey: new Web3PublicKey(input.buyerAddress),
        toPubkey: new Web3PublicKey(input.sellerAddress),
        lamports: Number(BigInt(input.priceLamports)),
      })
    ),
    signers: [],
    bytesCreatedOnChain: 0,
  });

  builder = builder.add(
    transfer(umi, {
      asset,
      collection: collection ?? undefined,
      payer: buyerSigner,
      authority: delegateAuthoritySigner,
      newOwner: publicKey(input.buyerAddress),
    })
  );

  builder = builder.add(
    approvePluginAuthority(umi, {
      asset: asset.publicKey,
      collection: collection?.publicKey,
      payer: buyerSigner,
      authority: delegateAuthoritySigner,
      plugin: { type: "TransferDelegate" },
      newAuthority: { type: "Owner" },
    })
  );

  const builtTransaction = await builder.useLegacyVersion().buildWithLatestBlockhash(umi);
  const web3Transaction = toWeb3JsLegacyTransaction(builtTransaction);

  return {
    serializedTransactionBase64: serializeSignedMarketplaceTransaction(web3Transaction, [delegateSigner]),
    delegateAddress,
  };
}

export async function broadcastMarketplaceTransaction(input: {
  signedTransactionBase64: string;
  additionalSigners?: Keypair[];
}) {
  const transaction = deserializeMarketplaceTransaction(input.signedTransactionBase64);

  if (input.additionalSigners?.length) {
    transaction.partialSign(...input.additionalSigners);
  }

  const connection = getSolanaConnection();
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}




