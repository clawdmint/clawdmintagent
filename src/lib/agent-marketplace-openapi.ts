export function buildAgentMarketplaceOpenApiDocument(appUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Clawdmint Agent Marketplace API",
      version: "1.0.0",
      description:
        "Public wallet-signed API for autonomous agents and humans to discover, mint, list, cancel, and buy Clawdmint NFTs. No Clawdmint agent registration is required for marketplace actions.",
    },
    servers: [{ url: appUrl }],
    tags: [
      { name: "Discovery", description: "Read public collections, assets, and marketplace state." },
      { name: "Mint", description: "Prepare, broadcast, and confirm wallet-signed NFT mint transactions." },
      { name: "Marketplace", description: "Prepare and confirm wallet-signed listing, cancel, and buy transactions." },
    ],
    paths: {
      "/api/collections/public": {
        get: {
          tags: ["Discovery"],
          summary: "List public Clawdmint collections",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["all", "ACTIVE", "SOLD_OUT"] } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: {
            "200": {
              description: "Public collection list with mint metadata.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PublicCollectionsResponse" } } },
            },
          },
        },
      },
      "/api/collections/{address}": {
        get: {
          tags: ["Discovery"],
          summary: "Read one public collection",
          parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Collection metadata, mint readiness, and endpoint hints.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
            "404": { description: "Collection not found." },
          },
        },
      },
      "/api/marketplace/assets": {
        get: {
          tags: ["Discovery"],
          summary: "List marketplace assets or wallet inventory",
          parameters: [
            { name: "collection", in: "query", schema: { type: "string" }, description: "Collection id or address." },
            { name: "owner", in: "query", schema: { type: "string" }, description: "Solana wallet address to read inventory for." },
            { name: "listed_only", in: "query", schema: { type: "boolean", default: false } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 24 } },
          ],
          responses: {
            "200": {
              description: "Asset list, including active listing data when present.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/AssetsResponse" } } },
            },
            "400": { description: "Invalid query." },
          },
        },
      },
      "/api/marketplace/assets/{assetAddress}": {
        get: {
          tags: ["Discovery"],
          summary: "Read one NFT asset",
          parameters: [{ name: "assetAddress", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Asset detail, owner, active listing, and related assets.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
            "404": { description: "Asset not found." },
          },
        },
      },
      "/api/collections/{address}/mint/prepare": {
        post: {
          tags: ["Mint"],
          summary: "Prepare an NFT mint transaction",
          description:
            "Returns a base64 transaction. wallet_address must sign it locally before broadcast. This endpoint is public and does not require a Clawdmint agent API key.",
          parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PrepareMintRequest" } } },
          },
          responses: {
            "200": {
              description: "Unsigned mint transaction and intent.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PrepareMintResponse" } } },
            },
            "409": { description: "Collection is not ready, sold out, or quantity exceeds remaining supply." },
          },
        },
      },
      "/api/collections/{address}/mint/broadcast": {
        post: {
          tags: ["Mint"],
          summary: "Broadcast a signed mint transaction",
          parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/BroadcastMintRequest" } } },
          },
          responses: {
            "200": {
              description: "Transaction signature.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/TxHashResponse" } } },
            },
          },
        },
      },
      "/api/collections/{address}/mint/confirm": {
        post: {
          tags: ["Mint"],
          summary: "Confirm and index a minted NFT",
          parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmMintRequest" } } },
          },
          responses: {
            "200": {
              description: "Recorded mint and updated collection state.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
          },
        },
      },
      "/api/marketplace/listings/prepare": {
        post: {
          tags: ["Marketplace"],
          summary: "Prepare a listing transaction",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PrepareListingRequest" } } },
          },
          responses: {
            "200": {
              description: "Unsigned listing transaction.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
            "403": { description: "wallet_address is not the current asset owner." },
          },
        },
      },
      "/api/marketplace/listings/confirm": {
        post: {
          tags: ["Marketplace"],
          summary: "Confirm a signed listing transaction",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmListingRequest" } } },
          },
          responses: {
            "200": {
              description: "Active listing created.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
          },
        },
      },
      "/api/marketplace/listings/cancel/prepare": {
        post: {
          tags: ["Marketplace"],
          summary: "Prepare listing cancellation",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PrepareCancelRequest" } } },
          },
          responses: {
            "200": {
              description: "Unsigned cancel transaction.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
          },
        },
      },
      "/api/marketplace/listings/cancel": {
        post: {
          tags: ["Marketplace"],
          summary: "Confirm listing cancellation",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmCancelRequest" } } },
          },
          responses: {
            "200": {
              description: "Listing cancelled.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
          },
        },
      },
      "/api/marketplace/buy/prepare": {
        post: {
          tags: ["Marketplace"],
          summary: "Prepare a marketplace purchase",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PrepareBuyRequest" } } },
          },
          responses: {
            "200": {
              description: "Unsigned buy transaction.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
          },
        },
      },
      "/api/marketplace/buy/confirm": {
        post: {
          tags: ["Marketplace"],
          summary: "Confirm a signed marketplace purchase",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmBuyRequest" } } },
          },
          responses: {
            "200": {
              description: "Sale recorded and asset owner updated.",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        PublicCollectionsResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            collections: { type: "array", items: { type: "object", additionalProperties: true } },
            pagination: { type: "object", additionalProperties: true },
          },
          required: ["success", "collections", "pagination"],
        },
        AssetsResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            assets: { type: "array", items: { type: "object", additionalProperties: true } },
          },
          required: ["success", "assets"],
        },
        PrepareMintRequest: {
          type: "object",
          properties: {
            wallet_address: { type: "string", description: "Solana wallet that will sign and receive the NFT." },
            quantity: { type: "integer", minimum: 1, maximum: 10, default: 1 },
          },
          required: ["wallet_address"],
        },
        PrepareMintResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            mint: {
              type: "object",
              properties: {
                intent_id: { type: "string" },
                transaction_base64: { type: "string" },
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
        BroadcastMintRequest: {
          type: "object",
          properties: {
            intent_id: { type: "string" },
            signed_transaction_base64: { type: "string" },
          },
          required: ["intent_id", "signed_transaction_base64"],
        },
        ConfirmMintRequest: {
          type: "object",
          properties: {
            intent_id: { type: "string" },
            wallet_address: { type: "string" },
            tx_hash: { type: "string" },
          },
          required: ["intent_id", "wallet_address", "tx_hash"],
        },
        PrepareListingRequest: {
          type: "object",
          properties: {
            asset_address: { type: "string" },
            wallet_address: { type: "string" },
            price_native: { type: "string", description: "SOL amount, up to 9 decimals." },
          },
          required: ["asset_address", "wallet_address", "price_native"],
        },
        ConfirmListingRequest: {
          type: "object",
          properties: {
            asset_address: { type: "string" },
            wallet_address: { type: "string" },
            price_lamports: { type: "string" },
            signed_transaction_base64: { type: "string" },
          },
          required: ["asset_address", "wallet_address", "price_lamports", "signed_transaction_base64"],
        },
        PrepareCancelRequest: {
          type: "object",
          properties: {
            listing_id: { type: "string" },
            wallet_address: { type: "string" },
          },
          required: ["listing_id", "wallet_address"],
        },
        ConfirmCancelRequest: {
          type: "object",
          properties: {
            listing_id: { type: "string" },
            wallet_address: { type: "string" },
            signed_transaction_base64: { type: "string" },
          },
          required: ["listing_id", "wallet_address", "signed_transaction_base64"],
        },
        PrepareBuyRequest: {
          type: "object",
          properties: {
            listing_id: { type: "string" },
            wallet_address: { type: "string" },
          },
          required: ["listing_id", "wallet_address"],
        },
        ConfirmBuyRequest: {
          type: "object",
          properties: {
            listing_id: { type: "string" },
            wallet_address: { type: "string" },
            signed_transaction_base64: { type: "string" },
          },
          required: ["listing_id", "wallet_address", "signed_transaction_base64"],
        },
        TxHashResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            tx_hash: { type: "string" },
          },
          required: ["success", "tx_hash"],
        },
      },
    },
    "x-clawdmint-agent-marketplace": {
      auth: "none",
      signing: "wallet-local",
      private_key_handling: "Clients sign locally. Clawdmint never asks for unregistered agent private keys.",
      supported_wallets: "Any Solana wallet/keypair that can sign legacy base64 transactions.",
    },
  };
}
