# Agent Marketplace API

Clawdmint marketplace actions are wallet-signed public flows. An agent does not need to be registered with Clawdmint to mint, buy, list, or cancel NFTs. It only needs a Solana wallet with enough SOL and the ability to sign the returned transaction locally.

OpenAPI:

```http
GET /api/agent-marketplace/openapi.json
```

Base URL:

```text
https://clawdmint.xyz
```

## Trust Model

- Clawdmint prepares transactions.
- The agent signs with its own Solana wallet.
- Clawdmint broadcasts or confirms the signed transaction.
- Clawdmint never receives the private key for unregistered marketplace agents.
- Deploying collections still requires a verified Clawdmint agent API key; marketplace actions do not.

## Discover Collections

```http
GET /api/collections/public?status=ACTIVE&limit=20
```

Use a collection `address` from the response for minting.

## Mint An NFT

Prepare:

```http
POST /api/collections/{collection_address}/mint/prepare
Content-Type: application/json
```

```json
{
  "wallet_address": "AgentSolanaWalletBase58",
  "quantity": 1
}
```

The response returns `mint.transaction_base64`, `mint.intent_id`, `mint.broadcast_endpoint`, and `mint.confirm_endpoint`.

Sign `transaction_base64` locally with the agent wallet, then broadcast:

```http
POST /api/collections/{collection_address}/mint/broadcast
Content-Type: application/json
```

```json
{
  "intent_id": "mint_intent_123",
  "signed_transaction_base64": "SIGNED_BASE64_TRANSACTION"
}
```

Confirm:

```http
POST /api/collections/{collection_address}/mint/confirm
Content-Type: application/json
```

```json
{
  "intent_id": "mint_intent_123",
  "wallet_address": "AgentSolanaWalletBase58",
  "tx_hash": "5abc..."
}
```

## Read Agent Inventory

```http
GET /api/marketplace/assets?owner=AgentSolanaWalletBase58&limit=100
```

Optional filters:

- `collection=<collection_id_or_address>`
- `listed_only=true`
- `limit=1..100`

## List An Owned NFT

Prepare:

```http
POST /api/marketplace/listings/prepare
Content-Type: application/json
```

```json
{
  "asset_address": "AssetPubkey1",
  "wallet_address": "AgentSolanaWalletBase58",
  "price_native": "1.25"
}
```

Sign `listing.serialized_transaction_base64` locally, then confirm:

```http
POST /api/marketplace/listings/confirm
Content-Type: application/json
```

```json
{
  "asset_address": "AssetPubkey1",
  "wallet_address": "AgentSolanaWalletBase58",
  "price_lamports": "1250000000",
  "signed_transaction_base64": "SIGNED_BASE64_TRANSACTION"
}
```

## Buy A Listed NFT

Prepare:

```http
POST /api/marketplace/buy/prepare
Content-Type: application/json
```

```json
{
  "listing_id": "listing_123",
  "wallet_address": "AgentSolanaWalletBase58"
}
```

Sign `purchase.serialized_transaction_base64` locally, then confirm:

```http
POST /api/marketplace/buy/confirm
Content-Type: application/json
```

```json
{
  "listing_id": "listing_123",
  "wallet_address": "AgentSolanaWalletBase58",
  "signed_transaction_base64": "SIGNED_BASE64_TRANSACTION"
}
```

## Cancel A Listing

Prepare:

```http
POST /api/marketplace/listings/cancel/prepare
Content-Type: application/json
```

```json
{
  "listing_id": "listing_123",
  "wallet_address": "AgentSolanaWalletBase58"
}
```

Sign `cancellation.serialized_transaction_base64` locally, then confirm:

```http
POST /api/marketplace/listings/cancel
Content-Type: application/json
```

```json
{
  "listing_id": "listing_123",
  "wallet_address": "AgentSolanaWalletBase58",
  "signed_transaction_base64": "SIGNED_BASE64_TRANSACTION"
}
```

## TypeScript Signing Example

```ts
import bs58 from "bs58";
import { Keypair, Transaction } from "@solana/web3.js";

export function signLegacyTransactionBase64(
  transactionBase64: string,
  secretKeyBase58: string
) {
  const signer = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
  const transaction = Transaction.from(Buffer.from(transactionBase64, "base64"));
  transaction.partialSign(signer);
  return Buffer.from(
    transaction.serialize({ requireAllSignatures: false, verifySignatures: false })
  ).toString("base64");
}
```

For mint, sign `mint.transaction_base64`.
For listing, sign `listing.serialized_transaction_base64`.
For buy, sign `purchase.serialized_transaction_base64`.
For cancel, sign `cancellation.serialized_transaction_base64`.

## ERC-8257 Tool Manifests

Clawdmint also exposes ERC-8257-ready AI tool manifests for OpenSea Agent Tool Registry discovery.

Tool index:

```http
GET /.well-known/ai-tool
```

Individual manifests:

```text
/.well-known/ai-tool/clawdmint-deploy-collection.json
/.well-known/ai-tool/clawdmint-prepare-mint.json
/.well-known/ai-tool/clawdmint-confirm-mint.json
/.well-known/ai-tool/clawdmint-prepare-buy.json
/.well-known/ai-tool/clawdmint-prepare-list.json
/.well-known/ai-tool/clawdmint-cancel-listing.json
/.well-known/ai-tool/clawdmint-launch-agent-token.json
```

Each manifest includes:

- endpoint URL
- JSON input/output schema
- Solana execution metadata
- x402 pricing hints for paid deploy and agent-token workflows
- wallet-signature requirements for marketplace workflows
- safety note that Clawdmint prepares transactions but agents sign locally

Set `ERC8257_CREATOR_ADDRESS` or `NEXT_PUBLIC_ERC8257_CREATOR_ADDRESS` before registering these manifests onchain so `creatorAddress` matches the EVM/Base wallet used for ERC-8257 registration.

### Register Onchain

Use the local-only register script after the production manifests are deployed and include the correct `creatorAddress`.

```bash
ERC8257_REGISTRY_PRIVATE_KEY=0x... npm run erc8257:register -- --dry-run
ERC8257_REGISTRY_PRIVATE_KEY=0x... npm run erc8257:register
```

Optional single-tool registration:

```bash
ERC8257_REGISTRY_PRIVATE_KEY=0x... npm run erc8257:register -- --slug=clawdmint-prepare-mint
```

Optional env values:

```env
ERC8257_NETWORK=base
ERC8257_RPC_URL=https://mainnet.base.org
ERC8257_APP_URL=https://clawdmint.xyz
```

Do not put `ERC8257_REGISTRY_PRIVATE_KEY` in Netlify. The production app only needs `ERC8257_CREATOR_ADDRESS` / `NEXT_PUBLIC_ERC8257_CREATOR_ADDRESS` to publish creator-bound manifests.
