import {
  createCollection,
  mplCore,
  ruleSet,
} from "@metaplex-foundation/mpl-core";
import {
  addConfigLines,
  create,
  fetchCandyMachine,
  findCandyGuardPda,
  mintV1,
  mplCandyMachine,
  type DefaultGuardSetArgs,
  type DefaultGuardSetMintArgs,
} from "@metaplex-foundation/mpl-core-candy-machine";
import {
  createNoopSigner,
  generateSigner,
  keypairIdentity,
  lamports,
  publicKey,
  signerIdentity,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fromWeb3JsKeypair,
  toWeb3JsLegacyTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  Connection,
  Keypair,
} from "@solana/web3.js";
import { getSolanaRpcUrl } from "./solana-collections";

export const METAPLEX_MINT_ENGINE = "metaplex_core_candy_machine";
export const LEGACY_SOLANA_MINT_ENGINE = "legacy_solana_program";
export const MAX_METAPLEX_MINT_QUANTITY = 10;

const CONFIG_LINE_BATCH_SIZE = 20;
const DEPLOY_TX_FEE_BUFFER_LAMPORTS = BigInt(10_000_000);
const CANDY_MACHINE_INIT_MAX_ATTEMPTS = 12;
const CANDY_MACHINE_INIT_RETRY_DELAY_MS = 1500;

export class MetaplexMintError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "MetaplexMintError";
    this.status = status;
    this.details = details;
  }
}

export interface MetaplexDeployCollectionParams {
  authority: string;
  payoutAddress: string;
  name: string;
  symbol: string;
  baseUri: string;
  maxSupply: number;
  mintPriceLamports: bigint;
  royaltyBps: number;
}

export interface MetaplexDeployCollectionResult {
  cluster: "mainnet-beta" | "devnet";
  authority: string;
  collectionAddress: string;
  candyMachineAddress: string;
  candyGuardAddress: string;
  signature: string;
  configLineSignatures: string[];
  itemsLoaded: number;
  itemsAvailable: number;
  isFullyLoaded: boolean;
  walletBalanceLamports: string;
  recommendedDeployBalanceLamports: string;
  recommendedDeployBalanceSol: string;
}

export interface MetaplexConfigLoadProgress {
  configLineSignatures: string[];
  itemsLoaded: number;
  itemsAvailable: number;
  remainingConfigLines: number;
  isFullyLoaded: boolean;
}

export interface MetaplexCandyMachineState {
  itemsAvailable: number;
  itemsLoaded: number;
  itemsRedeemed: number;
  remaining: number;
  isSoldOut: boolean;
  isFullyLoaded: boolean;
}

export interface MetaplexMintPrepareParams {
  walletAddress: string;
  collectionAddress: string;
  candyMachineAddress: string;
  payoutAddress: string;
  quantity: number;
  mintPriceLamports: bigint;
}

export interface MetaplexMintPrepareResult {
  serializedTransactionBase64: string;
  assetAddresses: string[];
  totalPaidLamports: string;
}

function createServerUmi(signer: Keypair) {
  const umi = createUmi(getSolanaRpcUrl());
  umi.use(mplCore());
  umi.use(mplCandyMachine());
  umi.use(keypairIdentity(fromWeb3JsKeypair(signer)));
  return umi;
}

function createMintPreparationUmi(walletAddress: string) {
  const umi = createUmi(getSolanaRpcUrl());
  umi.use(mplCore());
  umi.use(mplCandyMachine());
  umi.use(signerIdentity(createNoopSigner(publicKey(walletAddress))));
  return umi;
}

function formatLamports(lamportsValue: bigint): string {
  const whole = lamportsValue / BigInt(1_000_000_000);
  const fraction = lamportsValue % BigInt(1_000_000_000);
  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(9, "0").replace(/0+$/, "")}`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function isCandyMachineInitializationError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  return message.includes("AccountNotInitialized") || message.includes("3012");
}

function buildCollectionMetadataUri(baseUri: string): string {
  return `${ensureTrailingSlash(baseUri)}collection.json`;
}

function buildConfigLineSettings(name: string, baseUri: string, maxSupply: number) {
  const maxIndexLength = String(maxSupply).length;
  return {
    prefixName: `${name} #`,
    nameLength: maxIndexLength,
    prefixUri: ensureTrailingSlash(baseUri),
    uriLength: `${maxSupply}.json`.length,
    isSequential: true,
  };
}

function buildConfigLines(maxSupply: number) {
  return Array.from({ length: maxSupply }, (_, index) => ({
    name: String(index + 1),
    uri: `${index + 1}.json`,
  }));
}

async function buildGuardArgs(input: {
  payoutAddress: string;
  mintPriceLamports: bigint;
}): Promise<Partial<DefaultGuardSetArgs>> {
  const guards: Partial<DefaultGuardSetArgs> = {};

  if (input.mintPriceLamports > BigInt(0)) {
    guards.solPayment = {
      lamports: lamports(input.mintPriceLamports),
      destination: publicKey(input.payoutAddress),
    };
  }

  return guards;
}

function buildMintArgs(input: {
  payoutAddress: string;
  mintPriceLamports: bigint;
}): Partial<DefaultGuardSetMintArgs> {
  const mintArgs: Partial<DefaultGuardSetMintArgs> = {};

  if (input.mintPriceLamports > BigInt(0)) {
    mintArgs.solPayment = {
      destination: publicKey(input.payoutAddress),
    };
  }

  return mintArgs;
}

async function getRecommendedDeployBalanceLamports(
  signer: Keypair,
  params: MetaplexDeployCollectionParams
): Promise<bigint> {
  const umi = createServerUmi(signer);
  const collectionSigner = generateSigner(umi);
  const candyMachineSigner = generateSigner(umi);
  const guardArgs = await buildGuardArgs(params);
  const baseBuilder = transactionBuilder()
    .add(
      createCollection(umi, {
        collection: collectionSigner,
        name: params.name,
        uri: buildCollectionMetadataUri(params.baseUri),
        updateAuthority: umi.identity.publicKey,
        plugins:
          params.royaltyBps > 0
            ? [
                {
                  type: "Royalties",
                  basisPoints: params.royaltyBps,
                  creators: [
                    {
                      address: publicKey(params.payoutAddress),
                      percentage: 100,
                    },
                  ],
                  ruleSet: ruleSet("None"),
                },
              ]
            : [],
      })
    )
    .add(
      await create(umi, {
        candyMachine: candyMachineSigner,
        collection: collectionSigner.publicKey,
        collectionUpdateAuthority: umi.identity,
        authority: umi.identity.publicKey,
        itemsAvailable: params.maxSupply,
        maxEditionSupply: 0,
        isMutable: true,
        configLineSettings: buildConfigLineSettings(params.name, params.baseUri, params.maxSupply),
        guards: guardArgs,
      })
    );

  const rentAmount = await baseBuilder.getRentCreatedOnChain(umi);
  const configTxCount = Math.ceil(params.maxSupply / CONFIG_LINE_BATCH_SIZE);
  const txFeeBuffer = DEPLOY_TX_FEE_BUFFER_LAMPORTS + BigInt(configTxCount) * BigInt(50_000);
  return rentAmount.basisPoints + txFeeBuffer;
}

async function waitForCandyMachineInitialization(
  umi: ReturnType<typeof createServerUmi>,
  candyMachineAddress: string
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CANDY_MACHINE_INIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      await fetchCandyMachine(umi, publicKey(candyMachineAddress));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < CANDY_MACHINE_INIT_MAX_ATTEMPTS) {
        await sleep(CANDY_MACHINE_INIT_RETRY_DELAY_MS);
      }
    }
  }

  throw new MetaplexMintError(
    502,
    "Candy machine initialization did not finalize in time",
    extractErrorMessage(lastError)
  );
}

async function addConfigLinesWithRetry(input: {
  umi: ReturnType<typeof createServerUmi>;
  candyMachineAddress: string;
  index: number;
  configLines: Array<{ name: string; uri: string }>;
}): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CANDY_MACHINE_INIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { signature } = await addConfigLines(input.umi, {
        candyMachine: publicKey(input.candyMachineAddress),
        authority: input.umi.identity,
        index: input.index,
        configLines: input.configLines,
      })
        .useLegacyVersion()
        .sendAndConfirm(input.umi, {
          confirm: { commitment: "finalized" },
        });

      return signature.toString();
    } catch (error) {
      lastError = error;
      if (!isCandyMachineInitializationError(error) || attempt === CANDY_MACHINE_INIT_MAX_ATTEMPTS) {
        break;
      }

      await sleep(CANDY_MACHINE_INIT_RETRY_DELAY_MS);
    }
  }

  throw new MetaplexMintError(
    502,
    "Candy machine config lines could not be written after initialization",
    extractErrorMessage(lastError)
  );
}

async function getCandyMachineConfigProgress(
  umi: ReturnType<typeof createServerUmi>,
  candyMachineAddress: string
) {
  const candyMachine = await fetchCandyMachine(umi, publicKey(candyMachineAddress));
  const itemsAvailable = Number(candyMachine.data.itemsAvailable);
  const itemsLoaded = Number(candyMachine.itemsLoaded || 0);

  return {
    itemsAvailable,
    itemsLoaded,
    remainingConfigLines: Math.max(itemsAvailable - itemsLoaded, 0),
    isFullyLoaded: itemsLoaded >= itemsAvailable,
  };
}

export async function continueMetaplexCollectionDeploy(
  signer: Keypair,
  params: {
    candyMachineAddress: string;
    maxSupply: number;
    maxConfigBatchesPerRun?: number;
  }
): Promise<MetaplexConfigLoadProgress> {
  const umi = createServerUmi(signer);
  await waitForCandyMachineInitialization(umi, params.candyMachineAddress);

  const configLineSignatures: string[] = [];
  const configLines = buildConfigLines(params.maxSupply);
  const batchLimit = Math.max(1, params.maxConfigBatchesPerRun ?? Number.MAX_SAFE_INTEGER);

  let progress = await getCandyMachineConfigProgress(umi, params.candyMachineAddress);
  let batchesWritten = 0;

  while (!progress.isFullyLoaded && batchesWritten < batchLimit) {
    const batch = configLines.slice(progress.itemsLoaded, progress.itemsLoaded + CONFIG_LINE_BATCH_SIZE);
    if (batch.length === 0) {
      break;
    }

    const configSignature = await addConfigLinesWithRetry({
      umi,
      candyMachineAddress: params.candyMachineAddress,
      index: progress.itemsLoaded,
      configLines: batch,
    });
    configLineSignatures.push(configSignature);
    batchesWritten += 1;
    progress = await getCandyMachineConfigProgress(umi, params.candyMachineAddress);
  }

  return {
    configLineSignatures,
    itemsLoaded: progress.itemsLoaded,
    itemsAvailable: progress.itemsAvailable,
    remainingConfigLines: progress.remainingConfigLines,
    isFullyLoaded: progress.isFullyLoaded,
  };
}

export async function deployMetaplexCollection(
  signer: Keypair,
  params: MetaplexDeployCollectionParams,
  options?: {
    maxConfigBatchesPerRun?: number;
  }
): Promise<MetaplexDeployCollectionResult> {
  const connection = new Connection(getSolanaRpcUrl(), "confirmed");
  const walletBalanceLamports = BigInt(await connection.getBalance(signer.publicKey, "confirmed"));
  const recommendedDeployBalanceLamports = await getRecommendedDeployBalanceLamports(signer, params);

  if (walletBalanceLamports < recommendedDeployBalanceLamports) {
    throw new MetaplexMintError(400, "Agent wallet does not have enough SOL to deploy", {
      wallet_address: signer.publicKey.toBase58(),
      balance_lamports: walletBalanceLamports.toString(),
      balance_sol: formatLamports(walletBalanceLamports),
      recommended_lamports: recommendedDeployBalanceLamports.toString(),
      recommended_sol: formatLamports(recommendedDeployBalanceLamports),
    });
  }

  const umi = createServerUmi(signer);
  const collectionSigner = generateSigner(umi);
  const candyMachineSigner = generateSigner(umi);
  const guardArgs = await buildGuardArgs(params);

  const deployBuilder = transactionBuilder()
    .add(
      createCollection(umi, {
        collection: collectionSigner,
        name: params.name,
        uri: buildCollectionMetadataUri(params.baseUri),
        updateAuthority: umi.identity.publicKey,
        plugins:
          params.royaltyBps > 0
            ? [
                {
                  type: "Royalties",
                  basisPoints: params.royaltyBps,
                  creators: [
                    {
                      address: publicKey(params.payoutAddress),
                      percentage: 100,
                    },
                  ],
                  ruleSet: ruleSet("None"),
                },
              ]
            : [],
      })
    )
    .add(
      await create(umi, {
        candyMachine: candyMachineSigner,
        collection: collectionSigner.publicKey,
        collectionUpdateAuthority: umi.identity,
        authority: umi.identity.publicKey,
        itemsAvailable: params.maxSupply,
        maxEditionSupply: 0,
        isMutable: true,
        configLineSettings: buildConfigLineSettings(params.name, params.baseUri, params.maxSupply),
        guards: guardArgs,
      })
    )
    .useLegacyVersion();

  const { signature } = await deployBuilder.sendAndConfirm(umi, {
    confirm: { commitment: "finalized" },
  });
  const configLineSignatures: string[] = [];
  const candyMachineAddress = candyMachineSigner.publicKey.toString();

  const configLoadProgress = await continueMetaplexCollectionDeploy(signer, {
    candyMachineAddress,
    maxSupply: params.maxSupply,
    maxConfigBatchesPerRun: options?.maxConfigBatchesPerRun,
  });
  configLineSignatures.push(...configLoadProgress.configLineSignatures);

  const candyGuardAddress = findCandyGuardPda(umi, {
    base: candyMachineSigner.publicKey,
  })[0];

  const cluster =
    process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "devnet" : "mainnet-beta";

  return {
    cluster,
    authority: signer.publicKey.toBase58(),
    collectionAddress: collectionSigner.publicKey,
    candyMachineAddress: candyMachineSigner.publicKey,
    candyGuardAddress,
    signature: signature.toString(),
    configLineSignatures,
    itemsLoaded: configLoadProgress.itemsLoaded,
    itemsAvailable: configLoadProgress.itemsAvailable,
    isFullyLoaded: configLoadProgress.isFullyLoaded,
    walletBalanceLamports: walletBalanceLamports.toString(),
    recommendedDeployBalanceLamports: recommendedDeployBalanceLamports.toString(),
    recommendedDeployBalanceSol: formatLamports(recommendedDeployBalanceLamports),
  };
}

export async function fetchMetaplexCandyMachineState(
  candyMachineAddress: string
): Promise<MetaplexCandyMachineState> {
  const umi = createUmi(getSolanaRpcUrl());
  umi.use(mplCore());
  umi.use(mplCandyMachine());

  const candyMachine = await fetchCandyMachine(umi, publicKey(candyMachineAddress));
  const itemsAvailable = Number(candyMachine.data.itemsAvailable);
  const itemsLoaded = Number(candyMachine.itemsLoaded || 0);
  const itemsRedeemed = Number(candyMachine.itemsRedeemed);
  const remaining = Math.max(itemsAvailable - itemsRedeemed, 0);

  return {
    itemsAvailable,
    itemsLoaded,
    itemsRedeemed,
    remaining,
    isSoldOut: remaining === 0,
    isFullyLoaded: itemsLoaded >= itemsAvailable,
  };
}

export async function prepareMetaplexMintTransaction(
  params: MetaplexMintPrepareParams
): Promise<MetaplexMintPrepareResult> {
  if (params.quantity < 1 || params.quantity > MAX_METAPLEX_MINT_QUANTITY) {
    throw new MetaplexMintError(
      400,
      `Quantity must be between 1 and ${MAX_METAPLEX_MINT_QUANTITY} for Solana mints`
    );
  }

  const onchainState = await fetchMetaplexCandyMachineState(params.candyMachineAddress);
  if (params.quantity > onchainState.remaining) {
    throw new MetaplexMintError(409, "Requested quantity exceeds remaining supply");
  }

  const umi = createMintPreparationUmi(params.walletAddress);
  const mintArgs = buildMintArgs(params);
  const candyGuard = findCandyGuardPda(umi, {
    base: publicKey(params.candyMachineAddress),
  })[0];
  const assetSigners = Array.from({ length: params.quantity }, () => generateSigner(umi));

  let builder = transactionBuilder().useLegacyVersion();
  for (const assetSigner of assetSigners) {
    builder = builder.add(
      mintV1(umi, {
        candyMachine: publicKey(params.candyMachineAddress),
        candyGuard,
        collection: publicKey(params.collectionAddress),
        minter: createNoopSigner(publicKey(params.walletAddress)),
        payer: createNoopSigner(publicKey(params.walletAddress)),
        owner: publicKey(params.walletAddress),
        asset: assetSigner,
        mintArgs,
      })
    );
  }

  if (!builder.fitsInOneTransaction(umi)) {
    throw new MetaplexMintError(
      400,
      `Mint request is too large for one Solana transaction. Try ${Math.max(
        1,
        params.quantity - 1
      )} NFT(s).`
    );
  }

  const signedTransaction = await builder.buildAndSign(umi);
  const web3Transaction = toWeb3JsLegacyTransaction(signedTransaction);
  const serialized = web3Transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    serializedTransactionBase64: Buffer.from(serialized).toString("base64"),
    assetAddresses: assetSigners.map((signer) => signer.publicKey),
    totalPaidLamports: (params.mintPriceLamports * BigInt(params.quantity)).toString(),
  };
}
