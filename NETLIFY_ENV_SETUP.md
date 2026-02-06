# Netlify Environment Variables Setup

> **IMPORTANT**: Do NOT create `.env.production` file in this repo!  
> Next.js auto-loads `.env.production` which conflicts with Netlify's environment system.  
> All variables must be set in **Netlify Dashboard** only.

## x402 Payment Protocol Variables

| Key | Scope | Secret | Example Value |
|-----|-------|--------|---------------|
| `X402_PAY_TO_ADDRESS` | All | No | `0xYourTreasuryAddress` |
| `X402_FACILITATOR_URL` | All | No | (leave empty for auto-detect) |
| `CDP_API_KEY_ID` | All | Yes | `your_cdp_key_id` |
| `CDP_API_KEY_SECRET` | All | Yes | `your_cdp_key_secret` |

## How to Configure

1. Go to **Netlify Dashboard** → Your Site → **Site settings** → **Environment variables**
2. Add each variable below
3. For sensitive values, check **"Contains secret values"**
4. Set appropriate **Scope** for each variable

---

## Public Variables

These are safe to expose (bundled in client-side code).

| Key | Scope | Secret | Example Value |
|-----|-------|--------|---------------|
| `NEXT_PUBLIC_CHAIN_ID` | All | No | `8453` |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | All | No | `0x5f4AA542ac013394e3e40fA26F75B5b6B406226C` |
| `NEXT_PUBLIC_ALCHEMY_ID` | All | No | `your_alchemy_api_key` |
| `NEXT_PUBLIC_WALLET_CONNECT_ID` | All | No | `your_project_id` |
| `NEXT_PUBLIC_APP_URL` | All | No | `https://clawdmint.xyz` |
| `NEXT_PUBLIC_APP_NAME` | All | No | `Clawdmint` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | All | No | `your_privy_app_id` |

---

## Secret Variables

**CRITICAL**: These must be marked as "Contains secret values" and scoped to **Functions only**.

### Database

| Key | Scope | Secret | Description |
|-----|-------|--------|-------------|
| `DATABASE_URL` | Functions | ✅ YES | Neon.tech PostgreSQL connection string |

### Blockchain

| Key | Scope | Secret | Description |
|-----|-------|--------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Functions | ✅ YES | Private key for contract deployment (with 0x prefix) |
| `TREASURY_ADDRESS` | Functions | No | Treasury wallet for platform fees |

### IPFS (Pinata)

| Key | Scope | Secret | Description |
|-----|-------|--------|-------------|
| `PINATA_API_KEY` | Functions | ✅ YES | Pinata API key |
| `PINATA_SECRET_KEY` | Functions | ✅ YES | Pinata secret key |
| `PINATA_JWT` | Functions | ✅ YES | Pinata JWT token |

### Authentication

| Key | Scope | Secret | Description |
|-----|-------|--------|-------------|
| `AGENT_HMAC_SECRET` | Functions | ✅ YES | Min 32 chars - for agent API auth |
| `AGENT_JWT_SECRET` | Functions | ✅ YES | Min 32 chars - for agent sessions |

---

## Optional Variables

| Key | Scope | Secret | Description |
|-----|-------|--------|-------------|
| `TWITTER_BEARER_TOKEN` | Functions | ✅ YES | For tweet verification |
| `BASESCAN_API_KEY` | Functions | ✅ YES | For contract verification |

---

## Netlify Scopes Explained

| Scope | When Used |
|-------|-----------|
| **All** | Builds, Functions, Runtime, Post-processing |
| **Builds** | During `npm run build` |
| **Functions** | API routes, server-side code |
| **Runtime** | Forms, signed redirects |
| **Post-processing** | Snippet injection |

---

## Security Checklist

- [ ] All `DATABASE_URL`, `*_KEY`, `*_SECRET`, `*_JWT` marked as secret
- [ ] Secret variables scoped to **Functions only**
- [ ] No `.env.production` file in repository
- [ ] `.env` and `.env.local` in `.gitignore`
- [ ] Sensitive variable policy enabled for public repos

---

## Quick Copy (for Netlify UI)

```
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_FACTORY_ADDRESS=0x5f4AA542ac013394e3e40fA26F75B5b6B406226C
NEXT_PUBLIC_ALCHEMY_ID=
NEXT_PUBLIC_WALLET_CONNECT_ID=
NEXT_PUBLIC_APP_URL=https://clawdmint.xyz
NEXT_PUBLIC_APP_NAME=Clawdmint
DATABASE_URL=
DEPLOYER_PRIVATE_KEY=
TREASURY_ADDRESS=
PINATA_API_KEY=
PINATA_SECRET_KEY=
PINATA_JWT=
AGENT_HMAC_SECRET=
AGENT_JWT_SECRET=
```
