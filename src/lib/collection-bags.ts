import { z } from "zod";
import { isSolanaAddress } from "./network-config";
import { type CollectionChain, isSolanaCollectionChain } from "./collection-chains";

const BAGS_NATIVE_AMOUNT_REGEX = /^\d+\.?\d*$/;
const LAMPORTS_PER_SOL = BigInt("1000000000");
const BAGS_PROVIDER_VALUES = ["wallet", "twitter", "kick", "github"] as const;

export type BagsRecipientProvider = (typeof BAGS_PROVIDER_VALUES)[number];
export type CollectionBagsStatus = "DISABLED" | "CONFIGURED" | "PREPARED" | "LIVE";
export type CollectionBagsMintAccess = "public" | "bags_balance";

export interface StoredBagsRecipientConfig {
  label: "creator" | "community" | "referral";
  provider: BagsRecipientProvider;
  bps: number;
  wallet?: string | null;
  username?: string | null;
}

export interface StoredCollectionBagsConfig {
  creatorWallet: string;
  creatorBps: number;
  community: StoredBagsRecipientConfig | null;
  referral: StoredBagsRecipientConfig | null;
  partnerWallet: string | null;
  partnerConfig: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
  twitterUrl: string | null;
  telegramUrl: string | null;
  initialBuySol: string;
  initialBuyLamports: string;
}

export interface CollectionBagsView {
  enabled: boolean;
  status: CollectionBagsStatus;
  token_address: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_metadata: string | null;
  launch_tx_hash: string | null;
  config_key: string | null;
  mint_access: CollectionBagsMintAccess;
  min_token_balance: string | null;
  creator_wallet: string | null;
  initial_buy_sol: string | null;
  fee_shares: StoredBagsRecipientConfig[];
  analytics: {
    lifetime_fees_lamports: string | null;
    lifetime_fees_sol: string | null;
    claimed_fees_lamports: string | null;
    claimed_fees_sol: string | null;
    score: number;
    updated_at: string | null;
  } | null;
}

const BagsShareRecipientInputSchema = z.object({
  provider: z.enum(BAGS_PROVIDER_VALUES).default("wallet"),
  wallet: z.string().optional(),
  username: z.string().max(64).optional(),
  bps: z.number().int().min(0).max(10000).default(0),
});

export const BagsCollectionConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    token_address: z.string().optional(),
    token_name: z.string().min(1).max(32).optional(),
    token_symbol: z.string().min(1).max(10).optional(),
    image_url: z.string().optional(),
    website_url: z.string().url().optional(),
    twitter_url: z.string().url().optional(),
    telegram_url: z.string().url().optional(),
    creator_wallet: z.string().optional(),
    initial_buy_sol: z.string().regex(BAGS_NATIVE_AMOUNT_REGEX, "Invalid SOL amount").default("0.01"),
    mint_access: z.enum(["public", "bags_balance"]).default("public"),
    min_token_balance: z.string().regex(BAGS_NATIVE_AMOUNT_REGEX, "Invalid token balance").optional(),
    creator_bps: z.number().int().min(0).max(10000).default(10000),
    community: BagsShareRecipientInputSchema.optional(),
    referral: BagsShareRecipientInputSchema.optional(),
    partner_wallet: z.string().optional(),
    partner_config: z.string().optional(),
  })
  .optional();

export type BagsCollectionConfigInput = z.infer<typeof BagsCollectionConfigSchema>;

export interface PreparedCollectionBagsRecord {
  authorityAddress: string | null;
  bagsStatus: CollectionBagsStatus;
  bagsTokenAddress: string | null;
  bagsTokenName: string | null;
  bagsTokenSymbol: string | null;
  bagsMintAccess: CollectionBagsMintAccess;
  bagsMinTokenBalance: string | null;
  bagsFeeConfig: string | null;
  bagsCreatorWallet: string | null;
  bagsInitialBuyLamports: string | null;
}

interface BagsRefineContext {
  chain: CollectionChain;
  authorityAddress?: string | null;
  payoutAddress: string;
}

interface PrepareCollectionBagsOptions extends BagsRefineContext {
  input?: BagsCollectionConfigInput;
  collectionName: string;
  collectionSymbol: string;
}

interface CollectionBagsRecordLike {
  bagsStatus?: string | null;
  bagsTokenAddress?: string | null;
  bagsTokenName?: string | null;
  bagsTokenSymbol?: string | null;
  bagsTokenMetadata?: string | null;
  bagsLaunchTxHash?: string | null;
  bagsConfigKey?: string | null;
  bagsMintAccess?: string | null;
  bagsMinTokenBalance?: string | null;
  bagsCreatorWallet?: string | null;
  bagsInitialBuyLamports?: string | null;
  bagsFeeConfig?: string | null;
  bagsScore?: number | null;
  bagsLifetimeFees?: string | null;
  bagsClaimedFees?: string | null;
  bagsAnalyticsUpdatedAt?: Date | null;
}

function parseDecimalAmount(input: string, decimals: number): bigint {
  const normalized = input.trim();
  if (!BAGS_NATIVE_AMOUNT_REGEX.test(normalized)) {
    throw new Error("Invalid amount");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0");
  const trimmedFraction = paddedFraction.slice(0, decimals);
  const scale = BigInt(`1${"0".repeat(decimals)}`);
  return BigInt(whole) * scale + BigInt(trimmedFraction || "0");
}

function formatLamports(amount?: string | null): string | null {
  if (!amount) return null;
  const lamports = BigInt(amount);
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = lamports % LAMPORTS_PER_SOL;
  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  const decimals = fraction.toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole}.${decimals}`;
}

export function hasBagsConfiguration(input?: BagsCollectionConfigInput | null): boolean {
  if (!input) {
    return false;
  }

  return Boolean(
    input.enabled ||
      input.token_address ||
      input.token_name ||
      input.token_symbol ||
      input.creator_wallet ||
      input.community?.bps ||
      input.referral?.bps ||
      input.mint_access === "bags_balance"
  );
}

function resolveCreatorWallet(
  input: BagsCollectionConfigInput | undefined,
  authorityAddress: string | null | undefined,
  payoutAddress: string
): string | null {
  if (input?.creator_wallet) {
    return input.creator_wallet;
  }

  if (authorityAddress && isSolanaAddress(authorityAddress)) {
    return authorityAddress;
  }

  if (isSolanaAddress(payoutAddress)) {
    return payoutAddress;
  }

  return null;
}

function getRecipientPath(label: "community" | "referral", key: string) {
  return ["bags", label, key];
}

function validateConfiguredRecipient(
  label: "community" | "referral",
  recipient: z.infer<typeof BagsShareRecipientInputSchema> | undefined,
  ctx: z.RefinementCtx
) {
  if (!recipient || recipient.bps === 0) {
    return;
  }

  if (recipient.provider === "wallet") {
    if (!recipient.wallet) {
      ctx.addIssue({
        path: getRecipientPath(label, "wallet"),
        code: z.ZodIssueCode.custom,
        message: "Wallet is required when provider is wallet",
      });
      return;
    }

    if (!isSolanaAddress(recipient.wallet)) {
      ctx.addIssue({
        path: getRecipientPath(label, "wallet"),
        code: z.ZodIssueCode.custom,
        message: "Bags fee share wallets must be Solana addresses",
      });
    }
    return;
  }

  if (!recipient.username) {
    ctx.addIssue({
      path: getRecipientPath(label, "username"),
      code: z.ZodIssueCode.custom,
      message: "Username is required for social fee share recipients",
    });
  }
}

export function refineBagsCollectionInput(
  input: BagsCollectionConfigInput | undefined,
  ctx: z.RefinementCtx,
  options: BagsRefineContext
) {
  if (!hasBagsConfiguration(input)) {
    return;
  }

  const creatorWallet = resolveCreatorWallet(input, options.authorityAddress, options.payoutAddress);
  if (!creatorWallet) {
    ctx.addIssue({
      path: ["bags", "creator_wallet"],
      code: z.ZodIssueCode.custom,
      message: "A Solana creator wallet is required for Bags communities",
    });
  } else if (!isSolanaAddress(creatorWallet)) {
    ctx.addIssue({
      path: ["bags", "creator_wallet"],
      code: z.ZodIssueCode.custom,
      message: "Creator wallet must be a Solana address",
    });
  }

  if (input?.token_address && !isSolanaAddress(input.token_address)) {
    ctx.addIssue({
      path: ["bags", "token_address"],
      code: z.ZodIssueCode.custom,
      message: "Bags token must be a Solana mint address",
    });
  }

  if (!input?.token_address) {
    if (!input?.token_name) {
      ctx.addIssue({
        path: ["bags", "token_name"],
        code: z.ZodIssueCode.custom,
        message: "Token name is required when launching a Bags token",
      });
    }

    if (!input?.token_symbol) {
      ctx.addIssue({
        path: ["bags", "token_symbol"],
        code: z.ZodIssueCode.custom,
        message: "Token symbol is required when launching a Bags token",
      });
    }
  }

  if (input?.mint_access === "bags_balance") {
    if (!isSolanaCollectionChain(options.chain)) {
      ctx.addIssue({
        path: ["bags", "mint_access"],
        code: z.ZodIssueCode.custom,
        message: "Token-gated minting is currently supported only for Solana collections",
      });
    }

    if (!input.min_token_balance) {
      ctx.addIssue({
        path: ["bags", "min_token_balance"],
        code: z.ZodIssueCode.custom,
        message: "Minimum token balance is required for token-gated mints",
      });
    }
  }

  validateConfiguredRecipient("community", input?.community, ctx);
  validateConfiguredRecipient("referral", input?.referral, ctx);

  if (input?.partner_wallet && !isSolanaAddress(input.partner_wallet)) {
    ctx.addIssue({
      path: ["bags", "partner_wallet"],
      code: z.ZodIssueCode.custom,
      message: "Partner wallet must be a Solana address",
    });
  }

  if (input?.partner_wallet && !input.partner_config) {
    ctx.addIssue({
      path: ["bags", "partner_config"],
      code: z.ZodIssueCode.custom,
      message: "Partner config is required when partner wallet is provided",
    });
  }

  const totalBps =
    (input?.creator_bps ?? 10000) +
    (input?.community?.bps ?? 0) +
    (input?.referral?.bps ?? 0);

  if (totalBps !== 10000) {
    ctx.addIssue({
      path: ["bags"],
      code: z.ZodIssueCode.custom,
      message: "Creator + community + referral basis points must total 10000",
    });
  }
}

export function prepareCollectionBagsRecord(
  options: PrepareCollectionBagsOptions
): PreparedCollectionBagsRecord {
  if (!hasBagsConfiguration(options.input)) {
    return {
      authorityAddress: options.authorityAddress || null,
      bagsStatus: "DISABLED",
      bagsTokenAddress: null,
      bagsTokenName: null,
      bagsTokenSymbol: null,
      bagsMintAccess: "public",
      bagsMinTokenBalance: null,
      bagsFeeConfig: null,
      bagsCreatorWallet: null,
      bagsInitialBuyLamports: null,
    };
  }

  const creatorWallet = resolveCreatorWallet(options.input, options.authorityAddress, options.payoutAddress);
  if (!creatorWallet) {
    throw new Error("Bags creator wallet could not be resolved");
  }

  const creatorBps = options.input?.creator_bps ?? 10000;
  const initialBuySol = options.input?.initial_buy_sol || "0.01";
  const initialBuyLamports = parseDecimalAmount(initialBuySol, 9).toString();

  const community =
    options.input?.community && options.input.community.bps > 0
      ? {
          label: "community" as const,
          provider: options.input.community.provider,
          wallet: options.input.community.wallet || null,
          username: options.input.community.username || null,
          bps: options.input.community.bps,
        }
      : null;

  const referral =
    options.input?.referral && options.input.referral.bps > 0
      ? {
          label: "referral" as const,
          provider: options.input.referral.provider,
          wallet: options.input.referral.wallet || null,
          username: options.input.referral.username || null,
          bps: options.input.referral.bps,
        }
      : null;

  const config: StoredCollectionBagsConfig = {
    creatorWallet,
    creatorBps,
    community,
    referral,
    partnerWallet: options.input?.partner_wallet || null,
    partnerConfig: options.input?.partner_config || null,
    imageUrl: options.input?.image_url || null,
    websiteUrl: options.input?.website_url || null,
    twitterUrl: options.input?.twitter_url || null,
    telegramUrl: options.input?.telegram_url || null,
    initialBuySol,
    initialBuyLamports,
  };

  return {
    authorityAddress: options.authorityAddress || null,
    bagsStatus: options.input?.token_address ? "LIVE" : "CONFIGURED",
    bagsTokenAddress: options.input?.token_address || null,
    bagsTokenName: options.input?.token_name || options.collectionName,
    bagsTokenSymbol: (options.input?.token_symbol || options.collectionSymbol).toUpperCase(),
    bagsMintAccess: options.input?.mint_access || "public",
    bagsMinTokenBalance: options.input?.min_token_balance || null,
    bagsFeeConfig: JSON.stringify(config),
    bagsCreatorWallet: creatorWallet,
    bagsInitialBuyLamports: initialBuyLamports,
  };
}

export function parseCollectionBagsConfig(raw?: string | null): StoredCollectionBagsConfig | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredCollectionBagsConfig;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getCollectionBagsFeeShares(
  config: StoredCollectionBagsConfig | null,
  fallbackCreatorWallet?: string | null
): StoredBagsRecipientConfig[] {
  if (!config) {
    return [];
  }

  const feeShares: StoredBagsRecipientConfig[] = [
    {
      label: "creator",
      provider: "wallet",
      wallet: fallbackCreatorWallet || config.creatorWallet,
      username: null,
      bps: config.creatorBps,
    },
  ];

  if (config.community) {
    feeShares.push(config.community);
  }

  if (config.referral) {
    feeShares.push(config.referral);
  }

  return feeShares.filter((entry) => entry.bps > 0);
}

export function calculateBagsScore(lifetimeFeesLamports?: string | null, claimedFeesLamports?: string | null): number {
  const lifetime = lifetimeFeesLamports ? Number(formatLamports(lifetimeFeesLamports) || "0") : 0;
  const claimed = claimedFeesLamports ? Number(formatLamports(claimedFeesLamports) || "0") : 0;
  const raw = Math.log10(lifetime + 1) * 70 + Math.log10(claimed + 1) * 30;
  return Number(raw.toFixed(4));
}

export function buildCollectionBagsView(collection: CollectionBagsRecordLike): CollectionBagsView | null {
  const status = (collection.bagsStatus || "DISABLED") as CollectionBagsStatus;
  const config = parseCollectionBagsConfig(collection.bagsFeeConfig);
  const enabled = status !== "DISABLED" || Boolean(collection.bagsTokenAddress) || Boolean(config);

  if (!enabled) {
    return null;
  }

  return {
    enabled,
    status,
    token_address: collection.bagsTokenAddress || null,
    token_name: collection.bagsTokenName || null,
    token_symbol: collection.bagsTokenSymbol || null,
    token_metadata: collection.bagsTokenMetadata || null,
    launch_tx_hash: collection.bagsLaunchTxHash || null,
    config_key: collection.bagsConfigKey || null,
    mint_access: (collection.bagsMintAccess || "public") as CollectionBagsMintAccess,
    min_token_balance: collection.bagsMinTokenBalance || null,
    creator_wallet: collection.bagsCreatorWallet || config?.creatorWallet || null,
    initial_buy_sol: config?.initialBuySol || formatLamports(collection.bagsInitialBuyLamports),
    fee_shares: getCollectionBagsFeeShares(config, collection.bagsCreatorWallet || null),
    analytics: collection.bagsTokenAddress
      ? {
          lifetime_fees_lamports: collection.bagsLifetimeFees || null,
          lifetime_fees_sol: formatLamports(collection.bagsLifetimeFees),
          claimed_fees_lamports: collection.bagsClaimedFees || null,
          claimed_fees_sol: formatLamports(collection.bagsClaimedFees),
          score: collection.bagsScore || 0,
          updated_at: collection.bagsAnalyticsUpdatedAt?.toISOString() || null,
        }
      : null,
  };
}
