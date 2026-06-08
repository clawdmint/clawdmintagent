import "server-only";

const MANIFEST_TYPE = "https://ercs.ethereum.org/ERCS/erc-8257#tool-manifest-v1";
export const ERC8257_REGISTRY_ADDRESS = "0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1";
export const ERC8257_REGISTERED_CREATOR_ADDRESS = "0xC1e76AaBf34d11789Cad3D2006A47749c3217972";
export const ERC8257_OPEN_ACCESS_PREDICATE = "0x0000000000000000000000000000000000000000";
export const ERC8257_REGISTRY_CHAIN = "base";

type JsonSchema = Record<string, unknown>;

type ToolManifest = {
  type: string;
  name: string;
  version: string;
  description: string;
  endpoint: string;
  inputs: JsonSchema;
  outputs: JsonSchema;
  tags: string[];
  pricing?: Record<string, unknown>;
  access?: Record<string, unknown>;
  creatorAddress?: string;
  "x-clawdmint": Record<string, unknown>;
};

type ToolDefinition = {
  slug: string;
  name: string;
  description: string;
  endpointPath: string;
  inputs: JsonSchema;
  outputs: JsonSchema;
  tags: string[];
  pricing?: Record<string, unknown>;
  relatedEndpoints?: string[];
  requiresWalletSignature?: boolean;
};

type ToolRegistration = {
  toolId: number;
  txHash: string;
};

const toolRegistrations: Record<string, ToolRegistration> = {
  "clawdmint-deploy-collection": {
    toolId: 97,
    txHash: "0xcb8aae5f536394dd08026becb9f064e2754c53eb244075d2ad456596391517b7",
  },
  "clawdmint-prepare-mint": {
    toolId: 98,
    txHash: "0x06ef4d76947b3abf6b5883dd90e7056d3739700ad8f653d890e836288217478e",
  },
  "clawdmint-confirm-mint": {
    toolId: 99,
    txHash: "0xe8c14dc0be13b2e8b2f4870336c8209f07f84e8c91195d89e4c693330774fde9",
  },
  "clawdmint-prepare-buy": {
    toolId: 100,
    txHash: "0x1f9d43390c6dd321a755dcc063eb8f841a0dba2c4f9a7f91bb14e2e500460c39",
  },
  "clawdmint-prepare-list": {
    toolId: 101,
    txHash: "0x6c6a677ef1054dc565ca7083d28215b11b98fe9f2c8c05784a321ebd5ba53fab",
  },
  "clawdmint-cancel-listing": {
    toolId: 102,
    txHash: "0x9f702280424a9e21d03d3c293d38fa77dca3bd920b5b06168e40489665dc6cbc",
  },
  "clawdmint-launch-agent-token": {
    toolId: 103,
    txHash: "0xf3fe8591660c09c4e6d6a6a33177fc9c84fac938de6e097134448a03eb3db43a",
  },
};

function solanaAddress(description: string): JsonSchema {
  return {
    type: "string",
    description,
    pattern: "^[1-9A-HJ-NP-Za-km-z]{32,44}$",
  };
}

function txBase64(description: string): JsonSchema {
  return {
    type: "string",
    description,
    contentEncoding: "base64",
  };
}

const successResponse: JsonSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
  },
  required: ["success"],
  additionalProperties: true,
};

const unsignedTransactionResponse: JsonSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    transaction_base64: txBase64("Unsigned Solana transaction for the caller wallet to sign locally."),
    serialized_transaction_base64: txBase64("Unsigned Solana transaction for the caller wallet to sign locally."),
    expires_at: { type: "string", format: "date-time" },
  },
  required: ["success"],
  additionalProperties: true,
};

function x402Pricing(resourcePath: string, amountUsd: string) {
  return {
    protocol: "x402",
    settlement: "solana-spl-usdc",
    currency: "USDC",
    amount: amountUsd,
    pricingUrl: "/api/x402/pricing",
    resource: resourcePath,
  };
}

const toolDefinitions: ToolDefinition[] = [
  {
    slug: "clawdmint-deploy-collection",
    name: "clawdmint.deployCollection",
    description:
      "Deploy a Solana Metaplex NFT collection through Clawdmint for a verified funded agent. The paid x402 wrapper returns collection deployment status and on-chain addresses.",
    endpointPath: "/api/x402/deploy",
    inputs: {
      type: "object",
      properties: {
        agent_api_key: { type: "string", description: "Verified Clawdmint agent API key." },
        name: { type: "string" },
        symbol: { type: "string" },
        description: { type: "string" },
        image: {
          type: "string",
          format: "uri",
          description: "HTTPS, IPFS, or data:image collection cover artwork.",
        },
        launch_style: {
          type: "string",
          enum: ["edition", "core_collection"],
          default: "edition",
          description: "edition uses one artwork for all minted Core assets; core_collection uses per-item config-line metadata for a Metaplex Core Collection.",
        },
        assets_manifest_url: {
          type: "string",
          description:
            "HTTPS or IPFS JSON manifest for core_collection launches. Use { items: [...] } or an array of items.",
        },
        items: {
          type: "array",
          maxItems: 10000,
          description: "Inline core_collection item metadata. Length must match max_supply.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              image: { type: "string", description: "HTTPS, IPFS, or data:image asset for this NFT." },
              attributes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    trait_type: { type: "string" },
                    value: { oneOf: [{ type: "string" }, { type: "number" }] },
                  },
                  required: ["trait_type", "value"],
                },
              },
              external_url: { type: "string", format: "uri" },
            },
            required: ["image"],
          },
        },
        max_supply: { type: "integer", minimum: 1 },
        mint_price_sol: { type: "string" },
        payout_address: solanaAddress("Solana payout wallet for primary mint proceeds."),
        royalty_bps: { type: "integer", minimum: 0, maximum: 10000 },
      },
      required: ["agent_api_key", "name", "symbol", "image", "max_supply", "payout_address"],
    },
    outputs: successResponse,
    tags: ["solana", "nft", "metaplex", "collection-deploy", "x402"],
    pricing: x402Pricing("/api/x402/deploy", "2.00"),
  },
  {
    slug: "clawdmint-prepare-mint",
    name: "clawdmint.prepareMint",
    description:
      "Prepare a wallet-signed Solana NFT mint transaction for any public Clawdmint collection. The agent signs locally; Clawdmint never receives the private key.",
    endpointPath: "/api/collections/{address}/mint/prepare",
    inputs: {
      type: "object",
      properties: {
        address: solanaAddress("Metaplex collection address."),
        wallet_address: solanaAddress("Solana wallet that will sign and receive the NFT."),
        quantity: { type: "integer", minimum: 1, maximum: 10, default: 1 },
      },
      required: ["address", "wallet_address"],
    },
    outputs: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        mint: {
          type: "object",
          properties: {
            intent_id: { type: "string" },
            transaction_base64: txBase64("Unsigned Solana mint transaction."),
            asset_addresses: { type: "array", items: { type: "string" } },
            broadcast_endpoint: { type: "string" },
            confirm_endpoint: { type: "string" },
            expires_at: { type: "string", format: "date-time" },
          },
          required: ["intent_id", "transaction_base64", "broadcast_endpoint", "confirm_endpoint"],
        },
      },
      required: ["success", "mint"],
    },
    tags: ["solana", "nft", "metaplex", "mint", "wallet-signed"],
    relatedEndpoints: [
      "/api/collections/{address}/mint/broadcast",
      "/api/collections/{address}/mint/confirm",
    ],
    requiresWalletSignature: true,
  },
  {
    slug: "clawdmint-confirm-mint",
    name: "clawdmint.confirmMint",
    description:
      "Confirm and index a Solana NFT mint after the agent signs and broadcasts the transaction, updating Clawdmint marketplace inventory.",
    endpointPath: "/api/collections/{address}/mint/confirm",
    inputs: {
      type: "object",
      properties: {
        address: solanaAddress("Metaplex collection address."),
        intent_id: { type: "string" },
        wallet_address: solanaAddress("Wallet that signed and received the NFT."),
        tx_hash: { type: "string", description: "Confirmed Solana transaction signature." },
      },
      required: ["address", "intent_id", "wallet_address", "tx_hash"],
    },
    outputs: successResponse,
    tags: ["solana", "nft", "metaplex", "mint-confirm", "indexing"],
  },
  {
    slug: "clawdmint-prepare-buy",
    name: "clawdmint.prepareBuy",
    description:
      "Prepare a wallet-signed Solana marketplace purchase transaction for an active Clawdmint NFT listing.",
    endpointPath: "/api/marketplace/buy/prepare",
    inputs: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        wallet_address: solanaAddress("Buyer Solana wallet that will sign the purchase."),
      },
      required: ["listing_id", "wallet_address"],
    },
    outputs: unsignedTransactionResponse,
    tags: ["solana", "nft", "marketplace", "buy", "wallet-signed"],
    relatedEndpoints: ["/api/marketplace/buy/confirm"],
    requiresWalletSignature: true,
  },
  {
    slug: "clawdmint-prepare-list",
    name: "clawdmint.prepareList",
    description:
      "Prepare a wallet-signed Solana listing transaction so an agent can sell an owned Clawdmint NFT at a SOL price.",
    endpointPath: "/api/marketplace/listings/prepare",
    inputs: {
      type: "object",
      properties: {
        asset_address: solanaAddress("Metaplex Core asset address to list."),
        wallet_address: solanaAddress("Current owner wallet that will sign the listing."),
        price_native: { type: "string", description: "SOL listing price, up to 9 decimals." },
      },
      required: ["asset_address", "wallet_address", "price_native"],
    },
    outputs: unsignedTransactionResponse,
    tags: ["solana", "nft", "marketplace", "sell", "list", "wallet-signed"],
    relatedEndpoints: ["/api/marketplace/listings/confirm"],
    requiresWalletSignature: true,
  },
  {
    slug: "clawdmint-cancel-listing",
    name: "clawdmint.cancelListing",
    description:
      "Prepare and confirm cancellation for an active Clawdmint NFT listing. The owner signs locally before confirmation.",
    endpointPath: "/api/marketplace/listings/cancel/prepare",
    inputs: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        wallet_address: solanaAddress("Current listing owner wallet that will sign cancellation."),
      },
      required: ["listing_id", "wallet_address"],
    },
    outputs: unsignedTransactionResponse,
    tags: ["solana", "nft", "marketplace", "cancel-listing", "wallet-signed"],
    relatedEndpoints: ["/api/marketplace/listings/cancel"],
    requiresWalletSignature: true,
  },
  {
    slug: "clawdmint-launch-agent-token",
    name: "clawdmint.launchAgentToken",
    description:
      "Launch a Solana-native Metaplex Genesis agent token for a verified Clawdmint agent through the paid x402 wrapper.",
    endpointPath: "/api/x402/agent-token",
    inputs: {
      type: "object",
      properties: {
        agent_api_key: { type: "string" },
        name: { type: "string" },
        symbol: { type: "string" },
        description: { type: "string" },
        image: {
          type: "string",
          format: "uri",
          pattern: "^https://",
          description: "HTTPS image URL for token artwork.",
        },
        launch_type: { type: "string", enum: ["bondingCurve", "launchpool"] },
        quote_mint: { type: "string", enum: ["SOL", "USDC"] },
        set_token_on_agent: { type: "boolean" },
      },
      required: ["agent_api_key", "name", "symbol", "image"],
    },
    outputs: successResponse,
    tags: ["solana", "agent-token", "metaplex-genesis", "x402"],
    pricing: x402Pricing("/api/x402/agent-token", "2.00"),
  },
];

function normalizeSlug(slug: string) {
  return slug.replace(/\.json$/i, "");
}

export function getErc8257ToolDefinitions() {
  return toolDefinitions.map((tool) => ({ ...tool }));
}

export function getErc8257RegisteredTools(appUrl: string) {
  return toolDefinitions.map((tool) => {
    const registration = toolRegistrations[tool.slug];

    return {
      ...tool,
      endpoint: `${appUrl}${tool.endpointPath}`,
      manifest: `${appUrl}/.well-known/ai-tool/${tool.slug}.json`,
      execution: tool.requiresWalletSignature
        ? "Wallet-signed Solana transaction"
        : "x402 paid HTTP execution",
      registration: registration
        ? {
            ...registration,
            chain: ERC8257_REGISTRY_CHAIN,
            creatorAddress: ERC8257_REGISTERED_CREATOR_ADDRESS,
            registryAddress: ERC8257_REGISTRY_ADDRESS,
            accessPredicate: ERC8257_OPEN_ACCESS_PREDICATE,
            txUrl: `https://basescan.org/tx/${registration.txHash}`,
            registryUrl: `https://basescan.org/address/${ERC8257_REGISTRY_ADDRESS}`,
          }
        : null,
    };
  });
}

export function getErc8257ToolSlugs() {
  return toolDefinitions.map((tool) => `${tool.slug}.json`);
}

export function buildErc8257ToolManifest(appUrl: string, requestedSlug: string): ToolManifest | null {
  const normalized = normalizeSlug(requestedSlug);
  const tool = toolDefinitions.find((candidate) => candidate.slug === normalized);
  if (!tool) {
    return null;
  }

  const creatorAddress =
    process.env["ERC8257_CREATOR_ADDRESS"]?.trim() ||
    process.env["NEXT_PUBLIC_ERC8257_CREATOR_ADDRESS"]?.trim() ||
    "";
  const endpoint = `${appUrl}${tool.endpointPath}`;
  const manifest: ToolManifest = {
    type: MANIFEST_TYPE,
    name: tool.name,
    version: "1.0.0",
    description: tool.description,
    endpoint,
    inputs: tool.inputs,
    outputs: tool.outputs,
    tags: tool.tags,
    access: {
      type: "open",
      predicate: "address(0)",
      notes: tool.pricing
        ? "Endpoint is open to probe and returns x402 payment requirements before paid execution."
        : "No Clawdmint bearer token is required. Wallet authorization happens through local Solana signatures.",
    },
    "x-clawdmint": {
      chain: "solana",
      execution: tool.requiresWalletSignature
        ? "wallet-signed-solana-transaction"
        : "x402-paid-http-solana-execution",
      openapi: tool.pricing ? `${appUrl}/api/x402/openapi.json` : `${appUrl}/api/agent-marketplace/openapi.json`,
      skill: `${appUrl}/skill.md`,
      pricing: `${appUrl}/api/x402/pricing`,
      relatedEndpoints: (tool.relatedEndpoints ?? []).map((path) => `${appUrl}${path}`),
      requiresWalletSignature: Boolean(tool.requiresWalletSignature),
      safety: tool.requiresWalletSignature
        ? "Clawdmint prepares transactions, but agents sign locally. Never send private keys to Clawdmint."
        : "Use x402 payment headers for paid execution. Never send external wallet private keys to Clawdmint.",
    },
  };

  if (tool.pricing) {
    manifest.pricing = {
      ...tool.pricing,
      pricingUrl: `${appUrl}/api/x402/pricing`,
    };
  }

  if (creatorAddress) {
    manifest.creatorAddress = creatorAddress;
  }

  return manifest;
}

export function buildErc8257ToolIndex(appUrl: string) {
  return {
    service: "Clawdmint",
    type: "https://ercs.ethereum.org/ERCS/erc-8257#tool-index-v1",
    description:
      "ERC-8257-ready manifests for Clawdmint Solana NFT deploy, mint, buy, list, cancel, and agent-token launch tools.",
    tools: toolDefinitions.map((tool) => ({
      name: tool.name,
      slug: tool.slug,
      manifest: `${appUrl}/.well-known/ai-tool/${tool.slug}.json`,
      endpoint: `${appUrl}${tool.endpointPath}`,
      tags: tool.tags,
    })),
  };
}
