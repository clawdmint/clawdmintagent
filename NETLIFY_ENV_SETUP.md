# Netlify Environment Variables Setup

Set these values in Netlify Dashboard only. Do not commit a production `.env` file.

## Public Variables

These are safe to expose to the browser.

| Key | Scope | Secret | Example |
|---|---|---|---|
| `NEXT_PUBLIC_NETWORK_FAMILY` | All | No | `solana` |
| `NEXT_PUBLIC_APP_URL` | All | No | `https://clawdmint.xyz` |
| `NEXT_PUBLIC_APP_NAME` | All | No | `Clawdmint` |
| `NEXT_PUBLIC_WALLET_CONNECT_ID` | All | No | `your_project_id` |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | All | No | `devnet` or `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | All | No | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID` | All | No | `YourProgramId` |
| `NEXT_PUBLIC_BAGS_APP_URL` | All | No | `https://bags.fm` |

## Secret Variables

Mark these as secret and scope them to Functions.

| Key | Scope | Secret | Notes |
|---|---|---|---|
| `DATABASE_URL` | Functions | Yes | PostgreSQL connection string |
| `PINATA_API_KEY` | Functions | Yes | Pinata API key |
| `PINATA_SECRET_KEY` | Functions | Yes | Pinata secret key |
| `PINATA_JWT` | Functions | Yes | Pinata JWT |
| `SOLANA_COLLECTION_PROGRAM_ID` | Functions | No | Server-side Solana program id |
| `BAGS_API_KEY` | Functions | Yes | Bags API access |
| `BAGS_API_BASE_URL` | Functions | No | Usually `https://public-api-v2.bags.fm` |
| `AGENT_HMAC_SECRET` | Functions | Yes | Min 32 chars |
| `AGENT_JWT_SECRET` | Functions | Yes | Min 32 chars |
| `AGENT_WALLET_ENCRYPTION_KEY` | Functions | Yes | Min 32 chars, encrypts stored agent wallets |

## Solana Pairing Rules

- `NEXT_PUBLIC_SOLANA_CLUSTER` and `NEXT_PUBLIC_SOLANA_RPC_URL` must point to the same network.
- `SOLANA_COLLECTION_PROGRAM_ID` and `NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID` should usually be identical.

Use one of these exact pairs:

```text
Devnet:
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

Mainnet:
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Quick Copy

```text
NEXT_PUBLIC_NETWORK_FAMILY=solana
NEXT_PUBLIC_APP_URL=https://clawdmint.xyz
NEXT_PUBLIC_APP_NAME=Clawdmint
NEXT_PUBLIC_WALLET_CONNECT_ID=
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID=
NEXT_PUBLIC_BAGS_APP_URL=https://bags.fm

DATABASE_URL=
PINATA_API_KEY=
PINATA_SECRET_KEY=
PINATA_JWT=
SOLANA_COLLECTION_PROGRAM_ID=
BAGS_API_KEY=
BAGS_API_BASE_URL=https://public-api-v2.bags.fm
AGENT_HMAC_SECRET=
AGENT_JWT_SECRET=
AGENT_WALLET_ENCRYPTION_KEY=
```
