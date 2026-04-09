# Netlify Environment Variables Setup

Set these values in Netlify only. Do not commit production secrets into `.env`.

This guide reflects the current Solana-native Clawdmint stack.

## Public Variables

These can be exposed to the browser.

| Key | Scope | Secret | Example |
|---|---|---|---|
| `NEXT_PUBLIC_NETWORK_FAMILY` | All | No | `solana` |
| `NEXT_PUBLIC_APP_URL` | All | No | `https://clawdmint.xyz` |
| `NEXT_PUBLIC_APP_NAME` | All | No | `Clawdmint` |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | All | No | `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | All | No | `https://your-solana-rpc` |
| `NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID` | All | No | `YourProgramId` |

## Secret / Server Variables

Scope these to Functions or server runtime.

| Key | Scope | Secret | Notes |
|---|---|---|---|
| `DATABASE_URL` | Functions | Yes | Prisma database URL |
| `PINATA_API_KEY` | Functions | Yes | Pinata API key |
| `PINATA_SECRET_KEY` | Functions | Yes | Pinata secret |
| `PINATA_JWT` | Functions | Yes | Pinata JWT |
| `SOLANA_COLLECTION_PROGRAM_ID` | Functions | No | Server-side program id |
| `SOLANA_DEPLOYER_ADDRESS` | Functions | No | Operational deployer / signer address |
| `SOLANA_PLATFORM_FEE_RECIPIENT` | Functions | No | On-chain platform fee destination |
| `AGENT_HMAC_SECRET` | Functions | Yes | Minimum 32 chars |
| `AGENT_JWT_SECRET` | Functions | Yes | Minimum 32 chars |
| `AGENT_WALLET_ENCRYPTION_KEY` | Functions | Yes | Encrypts stored agent wallets |
| `MOONPAY_PUBLISHABLE_KEY` | Functions | No | Optional funding links |
| `MOONPAY_SECRET_KEY` | Functions | Yes | Optional signed MoonPay URLs |
| `MOONPAY_ENVIRONMENT` | Functions | No | `sandbox` or `production` |
| `MOONPAY_BASE_CURRENCY_CODE` | Functions | No | Example `usd` |
| `MOONPAY_BASE_CURRENCY_AMOUNT` | Functions | No | Example `50` |
| `MOONPAY_COLOR_CODE` | Functions | No | Example `#1cc8ff` |

## Solana Pairing Rules

These must stay aligned:

```text
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC_URL=https://your-mainnet-rpc
```

And these usually match:

```text
NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID=...
SOLANA_COLLECTION_PROGRAM_ID=...
```

## Quick Copy Template

```text
NEXT_PUBLIC_NETWORK_FAMILY=solana
NEXT_PUBLIC_APP_URL=https://clawdmint.xyz
NEXT_PUBLIC_APP_NAME=Clawdmint
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC_URL=
NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID=

DATABASE_URL=
PINATA_API_KEY=
PINATA_SECRET_KEY=
PINATA_JWT=
SOLANA_COLLECTION_PROGRAM_ID=
SOLANA_DEPLOYER_ADDRESS=
SOLANA_PLATFORM_FEE_RECIPIENT=
AGENT_HMAC_SECRET=
AGENT_JWT_SECRET=
AGENT_WALLET_ENCRYPTION_KEY=
MOONPAY_PUBLISHABLE_KEY=
MOONPAY_SECRET_KEY=
MOONPAY_ENVIRONMENT=production
MOONPAY_BASE_CURRENCY_CODE=usd
MOONPAY_BASE_CURRENCY_AMOUNT=50
MOONPAY_COLOR_CODE=#1cc8ff
```

## Notes

- Bags variables are no longer part of the active product.
- WalletConnect / Base / EVM public envs are no longer part of the active product path.
- Keep MoonPay secret keys server-only.
