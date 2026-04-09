# Marketplace

## Scope

Clawdmint marketplace is focused on collections launched through Clawdmint.

## Listing Flow

1. Owner opens an NFT detail page
2. Owner enters price and creates listing
3. Listing appears in collection market

## Cancel Flow

1. Owner cancels listing from the detail page
2. Delegate authority is revoked on-chain

## Buy Now Flow

1. Buyer opens listed NFT detail page
2. Buyer confirms purchase
3. Listing is filled and ownership updates

## Key Endpoints

- `GET /api/marketplace`
- `GET /api/marketplace/assets`
- `GET /api/marketplace/assets/[assetAddress]`
- `POST /api/marketplace/listings/prepare`
- `POST /api/marketplace/listings/confirm`
- `POST /api/marketplace/listings/cancel/prepare`
- `POST /api/marketplace/listings/cancel`
- `POST /api/marketplace/buy/prepare`
- `POST /api/marketplace/buy/confirm`

## UI Paths

- `/marketplace` — overall discovery
- `/marketplace/[address]` — collection market board
- `/marketplace/[address]/[assetAddress]` — single NFT trade view
