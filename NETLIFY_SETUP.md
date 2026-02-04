# Netlify Environment Variables Setup

## Problem: "Netlify blocked adding environment variables"

Netlify's secrets scanner blocks environment variables when it detects sensitive patterns. Here's how to fix it.

---

## Solution 1: Use Netlify CLI (Recommended)

Install Netlify CLI and add variables as secrets:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Link your site
netlify link

# Add each secret variable (use --secret flag)
netlify env:set DATABASE_URL "your_database_url" --secret
netlify env:set DEPLOYER_PRIVATE_KEY "your_private_key" --secret
netlify env:set PINATA_JWT "your_pinata_jwt" --secret
netlify env:set PINATA_API_KEY "your_pinata_api_key" --secret
netlify env:set PINATA_SECRET_KEY "your_pinata_secret_key" --secret
netlify env:set AGENT_HMAC_SECRET "your_hmac_secret" --secret
netlify env:set AGENT_JWT_SECRET "your_jwt_secret" --secret

# Add public variables (no --secret flag needed)
netlify env:set NEXT_PUBLIC_CHAIN_ID "8453"
netlify env:set NEXT_PUBLIC_FACTORY_ADDRESS "0x5f4AA542ac013394e3e40fA26F75B5b6B406226C"
netlify env:set NEXT_PUBLIC_ALCHEMY_ID "your_alchemy_id"
netlify env:set NEXT_PUBLIC_WALLET_CONNECT_ID "your_walletconnect_id"
netlify env:set NEXT_PUBLIC_APP_URL "https://clawdmint.xyz"
netlify env:set NEXT_PUBLIC_APP_NAME "Clawdmint"
netlify env:set TREASURY_ADDRESS "0xYourTreasuryAddress"

# Optional
netlify env:set TWITTER_BEARER_TOKEN "your_twitter_token" --secret
netlify env:set BASESCAN_API_KEY "your_basescan_key"

# Verify all variables are set
netlify env:list

# Trigger a new deploy
netlify deploy --build --prod
```

---

## Solution 2: Netlify Dashboard with Sensitive Variable Policy

### Step 1: Disable Sensitive Variable Policy (for public repos)

1. Go to **Netlify Dashboard** → Your Site
2. **Site settings** → **Build & deploy** → **Continuous deployment**
3. Find **Sensitive variable policy**
4. Set to **"Allow all"** (or adjust as needed)

### Step 2: Add Variables in Dashboard

1. Go to **Site settings** → **Environment variables**
2. Click **Add a variable**
3. For each SECRET variable:
   - Enter the key and value
   - Check **"Contains secret values"**
   - Set **Scopes** to **"Functions"** only
4. For NEXT_PUBLIC_* variables:
   - Enter the key and value
   - Leave "Contains secret values" unchecked
   - Keep **Scopes** as **"All"**

---

## Required Variables

### Public (NEXT_PUBLIC_*) - All scopes, NOT secret

| Key | Value | Secret? |
|-----|-------|---------|
| `NEXT_PUBLIC_CHAIN_ID` | `8453` | No |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | `0x5f4AA542ac013394e3e40fA26F75B5b6B406226C` | No |
| `NEXT_PUBLIC_ALCHEMY_ID` | Your Alchemy ID | No |
| `NEXT_PUBLIC_WALLET_CONNECT_ID` | Your WalletConnect ID | No |
| `NEXT_PUBLIC_APP_URL` | `https://clawdmint.xyz` | No |
| `NEXT_PUBLIC_APP_NAME` | `Clawdmint` | No |

### Server Secrets - Functions scope only, MARK AS SECRET

| Key | Value | Secret? | Scope |
|-----|-------|---------|-------|
| `DATABASE_URL` | Neon.tech connection string | **YES** | Functions |
| `DEPLOYER_PRIVATE_KEY` | Your private key (no 0x) | **YES** | Functions |
| `TREASURY_ADDRESS` | Treasury wallet address | No | Functions |
| `PINATA_API_KEY` | Pinata API key | **YES** | Functions |
| `PINATA_SECRET_KEY` | Pinata secret | **YES** | Functions |
| `PINATA_JWT` | Pinata JWT token | **YES** | Functions |
| `AGENT_HMAC_SECRET` | 32+ char random string | **YES** | Functions |
| `AGENT_JWT_SECRET` | 32+ char random string | **YES** | Functions |

---

## Verify Setup

After adding variables, trigger a new deploy:

1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Clear cache and deploy site**

Then check the health endpoint:

```
https://clawdmint.xyz/api/health
```

It should return status information about your services.

---

## Common Issues

### "Build failed - secret detected in output"

This happens when secrets are inlined at build time. Our code uses `process.env["KEY"]` (bracket notation) to prevent this. If you still see this error:

1. Make sure you're using the latest code from GitHub
2. Clear Netlify build cache
3. Redeploy

### "Functions not working"

Check that:
1. Secret variables have scope set to "Functions"
2. All required variables are set
3. No typos in variable names

### "Database connection failed"

Verify `DATABASE_URL` is correctly formatted:
```
postgresql://user:password@host/database?sslmode=require
```

---

## Security Notes

1. **NEVER** commit `.env` files with real values to Git
2. **ALWAYS** mark sensitive values as secrets in Netlify
3. **ROTATE** all secrets if you suspect they were exposed
4. Use **Functions scope** for server-only variables
