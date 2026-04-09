# Netlify Setup

This guide reflects the current Solana-native Clawdmint deployment path.

## 1. Link the Site

```bash
npm install -g netlify-cli
netlify login
netlify link
```

## 2. Set Required Environment Variables

Recommended approach:

```bash
netlify env:set DATABASE_URL "your_database_url" --secret
netlify env:set PINATA_API_KEY "your_pinata_api_key" --secret
netlify env:set PINATA_SECRET_KEY "your_pinata_secret_key" --secret
netlify env:set PINATA_JWT "your_pinata_jwt" --secret
netlify env:set AGENT_HMAC_SECRET "your_hmac_secret" --secret
netlify env:set AGENT_JWT_SECRET "your_jwt_secret" --secret
netlify env:set AGENT_WALLET_ENCRYPTION_KEY "your_wallet_encryption_key" --secret
netlify env:set NEXT_PUBLIC_NETWORK_FAMILY "solana"
netlify env:set NEXT_PUBLIC_APP_URL "https://clawdmint.xyz"
netlify env:set NEXT_PUBLIC_APP_NAME "Clawdmint"
netlify env:set NEXT_PUBLIC_SOLANA_CLUSTER "mainnet-beta"
netlify env:set NEXT_PUBLIC_SOLANA_RPC_URL "your_rpc_url"
netlify env:set NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID "your_program_id"
netlify env:set SOLANA_COLLECTION_PROGRAM_ID "your_program_id"
netlify env:set SOLANA_DEPLOYER_ADDRESS "your_deployer_address"
netlify env:set SOLANA_PLATFORM_FEE_RECIPIENT "your_fee_wallet"
```

Optional MoonPay variables:

```bash
netlify env:set MOONPAY_PUBLISHABLE_KEY "pk_live_xxx"
netlify env:set MOONPAY_SECRET_KEY "sk_live_xxx" --secret
netlify env:set MOONPAY_ENVIRONMENT "production"
netlify env:set MOONPAY_BASE_CURRENCY_CODE "usd"
netlify env:set MOONPAY_BASE_CURRENCY_AMOUNT "50"
netlify env:set MOONPAY_COLOR_CODE "#1cc8ff"
```

## 3. Deploy

```bash
netlify deploy --build --prod
```

## 4. Validate After Deploy

Check these routes:

- `/api/health`
- `/agents`
- `/drops`
- `/marketplace`
- known collection page
- known market collection page

## 5. Common Problems

### Build fails because secrets are blocked
- add secrets with `--secret`
- keep server-only values out of `NEXT_PUBLIC_*`
- clear cache and redeploy if needed

### Functions fail at runtime
- check variable names exactly
- verify Functions-scope secrets are present
- verify Prisma database access

### Solana routes fail
- verify cluster and RPC match
- verify program IDs match
- verify deployer and fee recipient addresses are valid Solana addresses

### Mint or market actions fail
- verify agent wallet encryption keys exist
- verify marketplace-related envs are present
- verify production database includes the latest Prisma migrations

## 6. Current Product Notes

- Clawdmint is Solana-only.
- Base / EVM deployment variables are legacy and should not be used for the active stack.
- Bags variables are no longer part of the active deployment path.
