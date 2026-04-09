# Contracts Directory

This directory contains legacy EVM contract artifacts from an earlier Clawdmint architecture.

## Status

These contracts are **not** part of the active production stack.
The current Clawdmint product is built around:

- Solana mainnet
- Metaplex Core
- Candy Machine
- Metaplex agent registry
- server-side marketplace and asset indexing flows

## Why This Directory Still Exists

The repository still keeps these files for historical reference and migration context.
They should not be treated as the source of truth for the current launchpad or marketplace product.

## Active Production Reality

Current collection deployment and minting do **not** use:
- Base
- EVM allowlist factories
- ERC-721 deployment flow
- Foundry-based production deploy path

Instead, they use Solana and Metaplex-native infrastructure.

## Recommendation

If you are working on the active Clawdmint product, focus on:
- `src/app`
- `src/lib`
- `prisma`
- Solana / Metaplex configuration in `.env.example`

Treat this directory as legacy-only unless you are intentionally auditing old architecture.
