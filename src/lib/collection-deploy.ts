import { z } from "zod";
import {
  CollectionMetadata,
  NFTMetadata,
  UploadResult,
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

const NATIVE_AMOUNT_REGEX = /^\d+\.?\d*$/;
const MAX_CURATED_PFP_ITEMS = 10_000;
const MAX_ASSETS_MANIFEST_BYTES = 25 * 1024 * 1024;
const ASSETS_MANIFEST_TIMEOUT_MS = 20_000;

const MetadataAttributeSchema = z.object({
  trait_type: z.string().min(1).max(80),
  value: z.union([z.string().max(200), z.number()]),
});

const CuratedPfpItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  image: z.string().min(1),
  attributes: z.array(MetadataAttributeSchema).max(50).optional(),
  external_url: z.string().url().optional(),
});

const CuratedPfpManifestSchema = z.union([
  z.array(CuratedPfpItemSchema),
  z.object({
    items: z.array(CuratedPfpItemSchema),
  }),
]);

type CuratedPfpItem = z.infer<typeof CuratedPfpItemSchema>;
type DeployLaunchStyle = "edition" | "core_collection";
type DeployLaunchStyleInput = DeployLaunchStyle | "curated_pfp";

function normalizeLaunchStyle(value: DeployLaunchStyleInput | undefined): DeployLaunchStyle {
  return value === "curated_pfp" ? "core_collection" : value ?? "edition";
}

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

  const launchStyle = normalizeLaunchStyle(data.launch_style);
  if (launchStyle === "edition") {
    if (data.items && data.items.length > 0) {
      ctx.addIssue({
        path: ["items"],
        code: z.ZodIssueCode.custom,
        message: "items are only supported when launch_style is core_collection",
      });
    }

    if (data.assets_manifest_url) {
      ctx.addIssue({
        path: ["assets_manifest_url"],
        code: z.ZodIssueCode.custom,
        message: "assets_manifest_url is only supported when launch_style is core_collection",
      });
    }
  }

  if (launchStyle === "core_collection") {
    const hasInlineItems = Boolean(data.items?.length);
    const hasManifestUrl = Boolean(data.assets_manifest_url);

    if (data.max_supply > MAX_CURATED_PFP_ITEMS) {
      ctx.addIssue({
        path: ["max_supply"],
        code: z.ZodIssueCode.custom,
        message: `core_collection launches support up to ${MAX_CURATED_PFP_ITEMS} items`,
      });
    }

    if (hasInlineItems === hasManifestUrl) {
      ctx.addIssue({
        path: ["items"],
        code: z.ZodIssueCode.custom,
        message: "core_collection launches require exactly one of items or assets_manifest_url",
      });
    }

    if (data.items && data.items.length !== data.max_supply) {
      ctx.addIssue({
        path: ["items"],
        code: z.ZodIssueCode.custom,
        message: "items length must match max_supply",
      });
    }
  }
}

export const BaseDeployCollectionSchema = z.object({
  chain: z.string().optional(),
  launch_style: z.enum(["edition", "core_collection", "curated_pfp"]).default("edition"),
  name: z.string().min(1).max(100),
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Symbol must be uppercase alphanumeric"),
  description: z.string().max(1000).optional(),
  image: z.string(),
  assets_manifest_url: z.string().optional(),
  items: z.array(CuratedPfpItemSchema).max(MAX_CURATED_PFP_ITEMS).optional(),
  max_supply: z.number().int().min(1).max(100000),
  mint_price: z.string().regex(NATIVE_AMOUNT_REGEX, "Invalid native token amount").optional(),
  mint_price_eth: z.string().regex(NATIVE_AMOUNT_REGEX, "Invalid ETH amount").optional(),
  mint_price_sol: z.string().regex(NATIVE_AMOUNT_REGEX, "Invalid SOL amount").optional(),
  authority_address: z.string().optional(),
  payout_address: z.string(),
  royalty_bps: z.number().int().min(0).max(1000).default(500),
  metadata: z
    .object({
      external_url: z.string().url().optional(),
      attributes: z
        .array(
          MetadataAttributeSchema
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
  launchStyle: DeployLaunchStyle;
  itemCount: number;
}

function uploadedImageToIpfsUrl(upload: UploadResult): string {
  if (upload.url?.startsWith("ipfs://")) {
    return upload.url;
  }

  if (upload.cid) {
    return `ipfs://${upload.cid}`;
  }

  throw new Error("Image upload did not return an IPFS CID");
}

function isManifestUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  try {
    const url = new URL(urlString);

    if (url.protocol === "ipfs:") {
      return { safe: true };
    }

    if (url.protocol !== "https:") {
      return { safe: false, reason: "Only HTTPS or IPFS manifest URLs are allowed" };
    }

    const hostname = url.hostname;
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return { safe: false, reason: "Local, internal, and IP-based manifest URLs are not allowed" };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid manifest URL" };
  }
}

async function fetchAssetsManifest(manifestUrl: string): Promise<CuratedPfpItem[]> {
  const safety = isManifestUrlSafe(manifestUrl);
  if (!safety.safe) {
    throw new Error(`Assets manifest URL not allowed: ${safety.reason}`);
  }

  const fetchUrl = manifestUrl.startsWith("ipfs://") ? ipfsToHttp(manifestUrl) : manifestUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASSETS_MANIFEST_TIMEOUT_MS);

  try {
    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Clawdmint/1.0 NFT launch metadata fetcher",
      },
    });

    if (!response.ok) {
      throw new Error(`Assets manifest fetch failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (contentLength > MAX_ASSETS_MANIFEST_BYTES) {
      throw new Error("Assets manifest is too large");
    }

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_ASSETS_MANIFEST_BYTES) {
      throw new Error("Assets manifest is too large");
    }

    const parsed = CuratedPfpManifestSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error("Assets manifest does not match the curated PFP schema");
    }

    return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveCuratedPfpItems(data: DeployCollectionInput): Promise<CuratedPfpItem[]> {
  if (data.items?.length) {
    return data.items;
  }

  if (!data.assets_manifest_url) {
    throw new Error("core_collection launches require items or assets_manifest_url");
  }

  const items = await fetchAssetsManifest(data.assets_manifest_url);
  if (items.length !== data.max_supply) {
    throw new Error("Assets manifest item count must match max_supply");
  }

  if (items.length > MAX_CURATED_PFP_ITEMS) {
    throw new Error(`core_collection launches support up to ${MAX_CURATED_PFP_ITEMS} items`);
  }

  return items;
}

async function buildTokenMetadata(
  data: DeployCollectionInput,
  collectionDescription: string,
  fallbackExternalUrl: string | undefined,
  editionImageUrl: string
): Promise<NFTMetadata[]> {
  if (normalizeLaunchStyle(data.launch_style) === "core_collection") {
    const items = await resolveCuratedPfpItems(data);
    const tokenMetadata: NFTMetadata[] = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const itemNumber = index + 1;
      const imageUpload = await uploadImage(item.image, `${data.symbol}-${itemNumber}`);
      if (!imageUpload.success) {
        throw new Error(`Item ${itemNumber} image upload failed: ${imageUpload.error}`);
      }

      tokenMetadata.push({
        name: item.name || `${data.name} #${itemNumber}`,
        description: item.description || collectionDescription,
        image: uploadedImageToIpfsUrl(imageUpload),
        attributes: item.attributes || [],
        external_url: item.external_url || fallbackExternalUrl,
      });
    }

    return tokenMetadata;
  }

  return Array.from({ length: data.max_supply }, (_, index) => ({
    name: `${data.name} #${index + 1}`,
    description: collectionDescription,
    image: editionImageUrl,
    attributes: data.metadata?.attributes || [],
    external_url: fallbackExternalUrl,
  }));
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

  const imageUrl = uploadedImageToIpfsUrl(imageUpload);

  const collectionMeta: CollectionMetadata = {
    name: data.name,
    description: data.description || `${data.name} - Deployed by ${agentLabel} on Clawdmint`,
    image: imageUrl,
    external_link: data.metadata?.external_url,
    seller_fee_basis_points: data.royalty_bps,
    fee_recipient: data.payout_address,
  };

  const tokenMetadata = await buildTokenMetadata(
    data,
    collectionMeta.description,
    data.metadata?.external_url,
    imageUrl
  );

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
    launchStyle: normalizeLaunchStyle(data.launch_style),
    itemCount: tokenMetadata.length,
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
