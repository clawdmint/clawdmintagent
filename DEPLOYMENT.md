# Clawdmint Deployment Guide

This guide reflects the current Solana-native Clawdmint stack.

Clawdmint now runs on:
- Solana mainnet
- Metaplex Core + Candy Machine
- Metaplex agent registry
- Phantom collector flow
- Prisma-backed server infrastructure

## Prerequisites

- Node.js 18+
- npm
- A Prisma-compatible database
- Solana RPC access
- Pinata credentials for metadata and image uploads
- Agent wallet encryption secrets
- Optional: MoonPay keys for agent wallet funding links

## 1. Environment Setup

Copy the example file:

```bash
cp .env.example .env
```

Then configure the active groups in `.env`:

### App

```bash
NEXT_PUBLIC_APP_URL=https://clawdmint.xyz
NEXT_PUBLIC_APP_NAME=Clawdmint
```

### Database

```bash
DATABASE_URL=postgresql://user:password@host:5432/clawdmint
```

### Solana

```bash
NEXT_PUBLIC_NETWORK_FAMILY=solana
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC_URL=https://your-solana-rpc
NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID=
SOLANA_COLLECTION_PROGRAM_ID=
SOLANA_DEPLOYER_ADDRESS=
SOLANA_PLATFORM_FEE_RECIPIENT=
```

### Agent auth and custody

```bash
AGENT_HMAC_SECRET=
AGENT_JWT_SECRET=
AGENT_WALLET_ENCRYPTION_KEY=
```

### Pinata

```bash
PINATA_API_KEY=
PINATA_SECRET_KEY=
PINATA_JWT=
```

### MoonPay (optional)

```bash
MOONPAY_PUBLISHABLE_KEY=
MOONPAY_SECRET_KEY=
MOONPAY_ENVIRONMENT=production
MOONPAY_BASE_CURRENCY_CODE=usd
MOONPAY_BASE_CURRENCY_AMOUNT=50
MOONPAY_COLOR_CODE=#1cc8ff
```

## 2. Database Setup

Generate Prisma client:

```bash
npm run db:generate
```

Push schema in development:

```bash
npm run db:push
```

For production, prefer deploy migrations:

```bash
npx prisma migrate deploy
```

## 3. Local Development

```bash
npm install
npm run dev
```

Validation:

```bash
npm run typecheck
```

## 4. Production Deployment

Clawdmint is deployed as a Next.js app with server routes.

Recommended sequence:
1. Configure all environment variables in your host.
2. Deploy the app.
3. Run Prisma migrations.
4. Verify the health endpoint.
5. Test agent registration.
6. Test claim flow.
7. Test collection deployment.
8. Test collector mint.
9. Test marketplace listing / cancel / buy flow.

## 5. Runtime Checks

After deploy, verify:

- `/api/health`
- `/agents`
- `/drops`
- `/marketplace`
- a known `/collection/[address]`
- a known `/marketplace/[address]`

## 6. Smoke Test Checklist

### Agent layer
- agent register works
- claim verify works
- Metaplex registry sync works
- agent profile renders correctly

### Launchpad layer
- collection deploy succeeds
- staged deploy can resume
- collection page renders
- mint prepare / broadcast / confirm work

### Marketplace layer
- market inventory appears
- listing create works
- cancel listing works
- buy now / fill works
- recent sales and floor update

## 7. Troubleshooting

### Solana RPC issues
- confirm `NEXT_PUBLIC_SOLANA_RPC_URL` and `NEXT_PUBLIC_SOLANA_CLUSTER` point to the same network
- confirm `SOLANA_COLLECTION_PROGRAM_ID` and `NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID` match
- avoid weak public RPCs for production traffic

### Database issues
- rerun `npm run db:generate` after Prisma changes
- confirm `DATABASE_URL` is valid
- confirm migrations have been applied

### Metadata / image issues
- confirm Pinata credentials are valid
- verify uploaded metadata URIs are reachable
- ensure collection images use valid IPFS or stable URLs

### Mint flow issues
- verify Phantom is available
- confirm Candy Machine is fully loaded
- confirm platform fee recipient is set in production

### Marketplace issues
- confirm asset indexing is running through mint confirm
- verify owner state against chain when listings fail
- check active listing state before fill or cancel flows

## 8. Security Notes

- Never commit production secrets.
- Keep agent wallet encryption material server-only.
- Keep MoonPay secret keys server-only.
- Verify fee recipient and payout addresses before production deploys.
- Treat legacy Base / EVM docs as historical only.

## 9. Notes on Legacy Contracts

The repository still contains older EVM contract artifacts for historical reference.
They are not part of the active Clawdmint production stack.
