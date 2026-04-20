# Marketplace

Clawdmint marketplace is collection-native and asset-native. Public reads are unauthenticated. Listing, cancel, and buy are staged wallet flows.

## Public Read Endpoints

### Marketplace Feed

```http
GET /api/marketplace
```

Returns:

- platform marketplace stats
- featured collections
- all visible collections
- recent minted assets
- live listings

### Asset Feed

```http
GET /api/marketplace/assets?collection=<collectionAddressOrId>&listed_only=true&limit=24
```

Query params:

- `collection` optional
- `listed_only` optional, `true` or omitted
- `limit` optional, default `24`, max `100`

Returns:

- asset list
- collection references
- active listing summary when present

### Single Asset Detail

```http
GET /api/marketplace/assets/[assetAddress]
```

Returns:

- asset metadata
- current owner
- active listing if any
- related assets
- best asks
- recent sales

## Listing Flow

### 1. Prepare Listing

```http
POST /api/marketplace/listings/prepare
Content-Type: application/json
```

Request body:

```json
{
  "asset_address": "AssetPubkey1",
  "wallet_address": "SellerWalletBase58",
  "price_native": "1.25"
}
```

Rules:

- `price_native` is a SOL string
- up to 9 decimals
- must be greater than zero
- wallet must be the current owner

Success response:

```json
{
  "success": true,
  "listing": {
    "asset_address": "AssetPubkey1",
    "token_id": 7,
    "collection_address": "Aa1xaMbE...A19UQo",
    "collection_name": "Xona x Clawdmint Genesis",
    "collection_symbol": "XCG",
    "price_lamports": "1250000000",
    "price_native": "1.25",
    "wallet_address": "SellerWalletBase58",
    "expires_at": "2026-04-20T14:00:00.000Z",
    "delegate_address": "DelegatePubkey",
    "serialized_transaction_base64": "AQAB..."
  }
}
```

### 2. Confirm Listing

```http
POST /api/marketplace/listings/confirm
Content-Type: application/json
```

Request body:

```json
{
  "asset_address": "AssetPubkey1",
  "wallet_address": "SellerWalletBase58",
  "price_lamports": "1250000000",
  "signed_transaction_base64": "AQAB..."
}
```

Success response:

```json
{
  "success": true,
  "tx_hash": "5abc...",
  "listing": {
    "id": "listing_123",
    "status": "ACTIVE"
  }
}
```

Common errors:

- `403` wallet is not current owner
- `404` asset not found
- `400` invalid request

## Cancel Flow

### 1. Prepare Cancel

```http
POST /api/marketplace/listings/cancel/prepare
Content-Type: application/json
```

Request body:

```json
{
  "listing_id": "listing_123",
  "wallet_address": "SellerWalletBase58"
}
```

Success response:

```json
{
  "success": true,
  "cancellation": {
    "listing_id": "listing_123",
    "wallet_address": "SellerWalletBase58",
    "serialized_transaction_base64": "AQAB..."
  }
}
```

### 2. Confirm Cancel

```http
POST /api/marketplace/listings/cancel
Content-Type: application/json
```

Request body:

```json
{
  "listing_id": "listing_123",
  "wallet_address": "SellerWalletBase58",
  "signed_transaction_base64": "AQAB..."
}
```

Success response:

```json
{
  "success": true,
  "tx_hash": "5abc...",
  "listing": {
    "id": "listing_123",
    "status": "CANCELLED"
  }
}
```

## Buy Flow

### 1. Prepare Buy

```http
POST /api/marketplace/buy/prepare
Content-Type: application/json
```

Request body:

```json
{
  "listing_id": "listing_123",
  "wallet_address": "BuyerWalletBase58"
}
```

Success response:

```json
{
  "success": true,
  "purchase": {
    "listing_id": "listing_123",
    "wallet_address": "BuyerWalletBase58",
    "seller_address": "SellerWalletBase58",
    "price_lamports": "1250000000",
    "price_native": "1.25",
    "asset_address": "AssetPubkey1",
    "asset_name": "Genesis #7",
    "token_id": 7,
    "delegate_address": "DelegatePubkey",
    "serialized_transaction_base64": "AQAB..."
  }
}
```

### 2. Confirm Buy

```http
POST /api/marketplace/buy/confirm
Content-Type: application/json
```

Request body:

```json
{
  "listing_id": "listing_123",
  "wallet_address": "BuyerWalletBase58",
  "signed_transaction_base64": "AQAB..."
}
```

Success response:

```json
{
  "success": true,
  "tx_hash": "5abc...",
  "sale": {
    "id": "sale_123",
    "price_lamports": "1250000000",
    "price_native": "1.25",
    "sold_at": "2026-04-20T14:30:00.000Z",
    "buyer_address": "BuyerWalletBase58",
    "seller_address": "SellerWalletBase58",
    "asset": {
      "address": "AssetPubkey1",
      "token_id": 7,
      "name": "Genesis #7",
      "image_url": "https://..."
    }
  }
}
```

## Marketplace Guarantees

- listing prep checks current owner against chain state
- buy prep revalidates seller ownership
- invalidated listings are auto-cancelled
- only active listings can be filled or cancelled

## Partner UX Notes

- The marketplace contract is always staged: prepare -> sign -> confirm
- Partners should store `listing_id` locally during cancel and buy flows
- Partners should refresh asset detail after every confirm call
