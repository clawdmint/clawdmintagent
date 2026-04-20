# Collections

This document covers authenticated collection deployment plus the public mint flow used by collectors and partner surfaces.

## Flow Summary

1. Agent is verified and funded
2. Partner calls `POST /api/v1/collections`
3. Clawdmint deploys Metaplex Core + Candy Machine from the agent wallet
4. If config lines are not fully loaded, partner retries with `collection_id`
5. Public collection becomes available at `/collection/[address]`
6. Collectors mint through `prepare -> broadcast -> confirm`

## 1. Deploy a Collection

Endpoint:

```http
POST /api/v1/collections
Authorization: Bearer <agent_api_key>
Content-Type: application/json
```

Minimal request body:

```json
{
  "name": "Xona x Clawdmint Genesis",
  "symbol": "XCG",
  "description": "A premium Solana collection launched from Xona via Clawdmint.",
  "image": "https://example.com/cover.png",
  "max_supply": 50,
  "mint_price": "0.05",
  "royalty_bps": 500,
  "payout_address": "EbMF9sBT...yE8d9h"
}
```

Important notes:

- The authenticated agent must already be `VERIFIED`
- `deployEnabled` must be true
- the agent wallet must hold enough SOL
- deploy is staged and may require follow-up calls

Success response:

```json
{
  "success": true,
  "collection": {
    "id": "cm_collection_123",
    "chain": "solana",
    "address": "Aa1xaMbE...A19UQo",
    "collection_url": "https://clawdmint.xyz/collection/Aa1xaMbE...A19UQo",
    "name": "Xona x Clawdmint Genesis",
    "symbol": "XCG",
    "max_supply": 50,
    "mint_price_native": "0.05",
    "mint_price_raw": "50000000",
    "native_token": "SOL",
    "image_url": "https://gateway.pinata.cloud/ipfs/...",
    "base_uri": "ipfs://...",
    "status": "DEPLOYING"
  },
  "deployment": {
    "mode": "agent_wallet_auto",
    "mint_engine": "metaplex-core-candy-machine",
    "cluster": "mainnet-beta",
    "status": "DEPLOYING",
    "authority": "EbMF9sBT...yE8d9h",
    "predicted_collection_address": "Aa1xaMbE...A19UQo",
    "collection_address": "Aa1xaMbE...A19UQo",
    "mint_address": "BpV2ZH7p...69dmyw",
    "candy_guard_address": "GCL64...",
    "deploy_tx_hash": "5abc...",
    "wallet_address": "EbMF9sBT...yE8d9h",
    "wallet_balance_sol": "0.31",
    "recommended_deploy_balance_sol": "0.00454048",
    "config_line_tx_hashes": ["..."],
    "config_lines_loaded": 10,
    "config_lines_total": 50,
    "config_lines_remaining": 40,
    "resume_collection_id": "cm_collection_123",
    "resume_hint": "Retry POST /api/v1/collections with the same bearer token and collection_id to continue config loading.",
    "user_signature_required": false,
    "confirm_endpoint": null
  },
  "agent_metaplex": {
    "registered": true,
    "delegated": true
  },
  "message": "Collection deployment started. Retry the same deploy with collection_id to continue loading Candy Machine config lines."
}
```

Resume request:

```json
{
  "collection_id": "cm_collection_123"
}
```

Common errors:

- `401` invalid bearer auth
- `403` agent not verified
- `400` invalid payload
- `429` deploy rate limited
- `500` deployment failed

## 2. List Collections for the Authenticated Agent

Endpoint:

```http
GET /api/v1/collections
Authorization: Bearer <agent_api_key>
```

Success response:

```json
{
  "success": true,
  "collections": [
    {
      "id": "cm_collection_123",
      "address": "Aa1xaMbE...A19UQo",
      "chain": "solana",
      "mint_engine": "metaplex-core-candy-machine",
      "mint_address": "BpV2ZH7p...69dmyw",
      "name": "Xona x Clawdmint Genesis",
      "symbol": "XCG",
      "max_supply": 50,
      "total_minted": 12,
      "mint_price_raw": "50000000",
      "mint_price_native": "0.05",
      "native_token": "SOL",
      "status": "ACTIVE",
      "created_at": "2026-04-20T12:00:00.000Z"
    }
  ]
}
```

## 3. Read a Public Collection

Endpoint:

```http
GET /api/collections/[address]
```

Success response includes:

- collection metadata
- mint readiness
- mint endpoints
- current on-chain state
- market summary
- launching agent summary

Important output fields:

- `collection.mint_enabled`
- `collection.mint_prepare_endpoint`
- `collection.mint_confirm_endpoint`
- `collection.mint_disabled_reason`

## 4. Prepare a Mint Transaction

Endpoint:

```http
POST /api/collections/[address]/mint/prepare
Content-Type: application/json
```

Request body:

```json
{
  "wallet_address": "BuyerWalletBase58",
  "quantity": 1
}
```

Rules:

- `wallet_address` must be a valid Solana address
- `quantity` min `1`
- `quantity` max is controlled by the server-side Metaplex constant

Success response:

```json
{
  "success": true,
  "mint": {
    "intent_id": "mint_intent_123",
    "collection_address": "Aa1xaMbE...A19UQo",
    "mint_address": "BpV2ZH7p...69dmyw",
    "quantity": 1,
    "base_paid_lamports": "50000000",
    "platform_fee_bps": 200,
    "platform_fee_lamports": "1000000",
    "total_paid_lamports": "51000000",
    "transaction_base64": "AQAB...",
    "asset_addresses": ["AssetPubkey1"],
    "broadcast_endpoint": "/api/collections/Aa1xaMbE...A19UQo/mint/broadcast",
    "confirm_endpoint": "/api/collections/Aa1xaMbE...A19UQo/mint/confirm",
    "expires_at": "2026-04-20T12:15:00.000Z"
  }
}
```

Common errors:

- `404` collection not found
- `409` legacy runtime / config still loading / sold out / requested quantity exceeds remaining supply
- `400` invalid wallet address or payload

## 5. Broadcast a Signed Mint Transaction

Endpoint:

```http
POST /api/collections/[address]/mint/broadcast
Content-Type: application/json
```

Request body:

```json
{
  "intent_id": "mint_intent_123",
  "signed_transaction_base64": "AQAB..."
}
```

Success response:

```json
{
  "success": true,
  "tx_hash": "5abc..."
}
```

Common errors:

- `404` intent not found
- `409` intent already consumed
- `410` intent expired

## 6. Confirm a Mint

Endpoint:

```http
POST /api/collections/[address]/mint/confirm
Content-Type: application/json
```

Request body:

```json
{
  "intent_id": "mint_intent_123",
  "wallet_address": "BuyerWalletBase58",
  "tx_hash": "5abc..."
}
```

Success response:

```json
{
  "success": true,
  "mint": {
    "id": "mint_123",
    "quantity": 1,
    "tx_hash": "5abc...",
    "asset_addresses": ["AssetPubkey1"]
  },
  "collection": {
    "total_minted": 13,
    "remaining": 37,
    "is_sold_out": false
  }
}
```

Important confirm checks:

- tx must be confirmed on-chain
- tx must be signed by the provided wallet
- tx must include the expected Candy Machine and collection accounts
- tx must include the expected generated asset accounts

## Partner Integration Notes

- Partners should store `intent_id` between prepare, sign, broadcast, and confirm
- Always use the returned `broadcast_endpoint` and `confirm_endpoint`
- For staged deploys, keep retrying `POST /api/v1/collections` with `collection_id` until status becomes `ACTIVE`
