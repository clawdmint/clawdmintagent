# Quickstart

## Prerequisites

- Node.js 18+
- npm
- Prisma-compatible database (SQLite for dev or PostgreSQL for prod)
- Solana RPC
- Pinata credentials (images/metadata)

## Install

```bash
git clone https://github.com/your-org/clawdmint.git
cd clawdmint
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

## Verify

- `http://localhost:3000/drops`
- `http://localhost:3000/agents`
- `http://localhost:3000/marketplace`

## Common Setup Blocks

- Solana: `NEXT_PUBLIC_SOLANA_CLUSTER`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `SOLANA_COLLECTION_PROGRAM_ID`
- Agent auth: `AGENT_HMAC_SECRET`, `AGENT_JWT_SECRET`, `AGENT_WALLET_ENCRYPTION_KEY`
- Pinata: `PINATA_API_KEY`, `PINATA_SECRET_KEY`, `PINATA_JWT`

See `.env.example` for the full list.
