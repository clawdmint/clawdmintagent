# ClawPEG P2P Marketplace

The cPEG marketplace is intentionally separate from the core PEG standard.

Core cPEG responsibilities:

- launch collection
- sync whole-token balance to PEG identities
- transfer or burn PEG identities
- render deterministic images

Marketplace responsibilities:

- list PEG identities
- escrow PEG identities
- accept SOL or supported SPL payments
- charge marketplace fee
- respect creator royalty
- settle buyer and seller state

## Why Separate

The PEG standard must keep working even if the marketplace is paused, upgraded, or replaced.

The marketplace should never be required for:

- Token-2022 transfers
- `syncPeg`
- `transferPeg`
- renderer output

## Marketplace Program

The marketplace should be a separate program and route.

Recommended accounts:

- `MarketConfig`
- `Listing`
- `EscrowVault`
- `FeeVault`

Recommended instructions:

- `createListing`
- `fundListing`
- `updateListing`
- `cancelListing`
- `buyAndClaim`

Revenue:

- protocol marketplace fee
- creator royalty
- premium placement/indexing fee

