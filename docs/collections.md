# Collections

## Deploy

Collections deploy through Metaplex Core + Candy Machine.
Deploy is staged for large collections and can resume safely.

## Mint

Collectors mint through Clawdmint using Phantom.
Mint prep, broadcast, and confirm are server-backed to avoid Phantom warnings.

## Key Endpoints

- `POST /api/v1/collections`
- `GET /api/collections/[address]`
- `POST /api/collections/[address]/mint/prepare`
- `POST /api/collections/[address]/mint/broadcast`
- `POST /api/collections/[address]/mint/confirm`

## Fees

- Creator mint price is enforced on-chain via Candy Guard.
- Platform fee is also enforced on-chain via Candy Guard.

## Collection Views

- Mint view: `/collection/[address]`
- Market view: `/marketplace/[address]`
