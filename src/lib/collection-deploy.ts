import { z } from "zod";
import {
  CollectionMetadata,
  NFTMetadata,
  ipfsToHttp,
  uploadCollectionMetadata,
  uploadImage,
} from "@/lib/ipfs";
import {
  getCollectionNativeToken,
  isSolanaCollectionChain,
  normalizeCollectionAddress,
  normalizeCollectionChain,
  parseCollectionMintPrice,
  resolveMintPriceInput,
  validateCollectionPayoutAddress,
  type CollectionChain,
} from "@/lib/collection-chains";
import {
  isSupportedWalletAddress,
  normalizeWalletAddress,
} from "@/lib/network-config";
import {
  BagsCollectionConfigSchema,
  refineBagsCollectionInput,
} from "@/lib/collection-bags";

const NATIVE_AMOUNT_REGEX = /^\d+\.?\d*$/;

export function refineDeployCollectionInput(
  data: z.infer<typeof BaseDeployCollectionSchema>,
  ctx: z.RefinementCtx
) {
  const chain = normalizeCollectionChain(data.chain);

  if (!isSolanaCollectionChain(chain)) {
    ctx.addIssue({
      path: ["chain"],
      code: z.ZodIssueCode.custom,
      message: "Clawdmint is currently running in Solana-only mode",
    });
    return;
  }

  const mintPrice = resolveMintPriceInput(chain, data);

  if (!mintPrice) {
    ctx.addIssue({
      path: [chain.startsWith("solana") ? "mint_price_sol" : "mint_price_eth"],
      code: z.ZodIssueCode.custom,
      message: `Mint price is required for ${getCollectionNativeToken(chain)}`,
    });
  }

  if (!validateCollectionPayoutAddress(data.payout_address, chain)) {
    ctx.addIssue({
      path: ["payout_address"],
      code: z.ZodIssueCode.custom,
      message: `Invalid ${getCollectionNativeToken(chain)} payout address`,
    });
  }

  if (data.authority_address && !validateCollectionPayoutAddress(data.authority_address, chain)) {
    ctx.addIssue({
      path: ["authority_address"],
      code: z.ZodIssueCode.custom,
      message: `Invalid ${getCollectionNativeToken(chain)} authority address`,
    });
  }

  refineBagsCollectionInput(data.bags, ctx, {
    chain,
    authorityAddress: data.authority_address,
    payoutAddress: data.payout_address,
  });
}

export const BaseDeployCollectionSchema = z.object({
  chain: z.string().optional(),
  name: z.string().min(1).max(100),
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Symbol must be uppercase alphanumeric"),
  description: z.string().max(1000).optional(),
  image: z.string(),
  max_supply: z.number().int().min(1).max(100000),
  mint_price: z.string().regex(NATIVE_AMOUNT_REGEX, "Invalid native token amount").optional(),
  mint_price_eth: z.string().regex(NATIVE_AMOUNT_REGEX, "Invalid ETH amount").optional(),
  mint_price_sol: z.string().regex(NATIVE_AMOUNT_REGEX, "Invalid SOL amount").optional(),
  authority_address: z.string().optional(),
  payout_address: z.string(),
  royalty_bps: z.number().int().min(0).max(1000).default(500),
  bags: BagsCollectionConfigSchema,
  metadata: z
    .object({
      external_url: z.string().url().optional(),
      attributes: z
        .array(
          z.object({
            trait_type: z.string(),
            value: z.union([z.string(), z.number()]),
          })
        )
        .optional(),
    })
    .optional(),
});

export const DeployCollectionSchema = BaseDeployCollectionSchema.superRefine(refineDeployCollectionInput);

export type DeployCollectionInput = z.infer<typeof DeployCollectionSchema>;

export interface PreparedCollectionAssets {
  chain: CollectionChain;
  authorityAddress: string;
  imageUrl: string;
  imageHttpUrl: string;
  baseUri: string;
  folderCid: string;
  mintPriceRaw: string;
  mintPriceInput: string;
  nativeToken: string;
}

export async function prepareCollectionAssets(
  data: DeployCollectionInput,
  agentLabel: string
): Promise<PreparedCollectionAssets> {
  const chain = normalizeCollectionChain(data.chain);
  const mintPriceInput = resolveMintPriceInput(chain, data);

  if (!mintPriceInput) {
    throw new Error("Mint price is required");
  }

  const imageUpload = await uploadImage(data.image, `${data.symbol}-cover`);
  if (!imageUpload.success) {
    throw new Error(`Image upload failed: ${imageUpload.error}`);
  }

  const imageUrl = `ipfs://${imageUpload.cid}`;

  const collectionMeta: CollectionMetadata = {
    name: data.name,
    description: data.description || `${data.name} - Deployed by ${agentLabel} on Clawdmint`,
    image: imageUrl,
    external_link: data.metadata?.external_url,
    seller_fee_basis_points: data.royalty_bps,
    fee_recipient: data.payout_address,
  };

  const tokenMetadata: NFTMetadata[] = [];
  for (let i = 1; i <= data.max_supply; i += 1) {
    tokenMetadata.push({
      name: `${data.name} #${i}`,
      description: collectionMeta.description,
      image: imageUrl,
      attributes: data.metadata?.attributes || [],
      external_url: data.metadata?.external_url,
    });
  }

  const folderUpload = await uploadCollectionMetadata(collectionMeta, tokenMetadata, data.name);
  if (!folderUpload.success || !folderUpload.cid) {
    throw new Error(`Metadata upload failed: ${folderUpload.error || "missing cid"}`);
  }

  return {
    chain,
    authorityAddress: data.authority_address || data.payout_address,
    imageUrl,
    imageHttpUrl: ipfsToHttp(imageUrl),
    baseUri: folderUpload.url || `ipfs://${folderUpload.cid}/`,
    folderCid: folderUpload.cid,
    mintPriceRaw: parseCollectionMintPrice(mintPriceInput, chain),
    mintPriceInput,
    nativeToken: getCollectionNativeToken(chain),
  };
}

export function normalizeAgentWallet(value: string): string {
  if (!isSupportedWalletAddress(value)) {
    return value;
  }

  return normalizeWalletAddress(value);
}

export function normalizeDeployedCollectionAddress(address: string, chain: CollectionChain): string {
  return normalizeCollectionAddress(address, chain);
}
