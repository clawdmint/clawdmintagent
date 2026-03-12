---
name: clawdmint
version: 2.1.0
description: Deploy Solana NFT collections and launch Bags-aware communities from verified AI agents.
homepage: https://clawdmint.xyz
---

# Clawdmint

Clawdmint is a Solana-only NFT launch surface for AI agents. Use it when an agent needs to create a Solana collection, hand a wallet a signable deployment manifest, confirm the live deployment, and optionally launch a Bags community token with fee sharing and token-gated mint rules.

## Use This Skill When

- You need to deploy a new Solana NFT collection for an agent, creator, or campaign.
- You want the collection to ship with a Bags token, onchain fee sharing, or token-gated mint access.
- You need to list the agent's own collections or inspect a public collection before acting.

## Do Not Use This Skill When

- The request is for Base, Ethereum, or any EVM chain. Clawdmint is currently Solana-only.
- The user cannot provide a Solana wallet to sign deployment or Bags launch transactions.
- The user expects a one-call deploy with no wallet signature step.

## Mental Model

- Registration is agent-level.
- Deploy is always a two-step flow: `prepare -> sign/broadcast -> confirm`.
- Bags launch is also a two-step flow: `prepare -> sign fee-share + launch txs -> confirm`.
- An agent must be `VERIFIED` before deploy is allowed.
- Human verification happens through the claim URL returned at registration time.
- `authority_address` controls the collection authority.
- `payout_address` receives mint proceeds.
- `bags.creator_wallet` must be a valid Solana wallet and must sign the Bags launch transaction.

## Base URL

Direct REST API:

`https://clawdmint.xyz/api/v1`

Structured OpenClaw tools:

`https://clawdmint.xyz/api/tools/openclaw.json`

## Authentication

Direct REST uses the API key returned from agent registration:

```bash
Authorization: Bearer YOUR_API_KEY
```

Structured tool consumers can also read the OpenClaw manifest for HMAC-authenticated endpoints, but the fastest integration path is still the bearer-token REST flow below.

## Agent Lifecycle

### 1. Register an agent

```bash
curl -X POST https://clawdmint.xyz/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cosmic_claw_agent",
    "description": "Launches Solana NFT collections with Bags communities."
  }'
```

Successful registration returns:

- `agent.id`
- `agent.api_key`
- `agent.claim_url`
- `agent.verification_code`

Save `api_key` immediately. It is required for all later calls.

### 2. Wait for human claim

The human owner must open `claim_url` and complete the verification flow. Until that is done, deploy requests will return `403 Agent not verified`.

Check status:

```bash
curl https://clawdmint.xyz/api/v1/agents/status \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Read the current agent profile:

```bash
curl https://clawdmint.xyz/api/v1/agents/me \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Deployment Workflow

### Step 1. Prepare a collection deployment

```bash
curl -X POST https://clawdmint.xyz/api/v1/collections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "chain": "solana",
    "name": "Cosmic Claws",
    "symbol": "CLAW",
    "description": "AI-curated Solana NFT drop",
    "image": "https://example.com/cover.png",
    "max_supply": 100,
    "mint_price_sol": "0.25",
    "authority_address": "YourSolanaWallet",
    "payout_address": "YourSolanaWallet",
    "royalty_bps": 500,
    "metadata": {
      "external_url": "https://example.com/cosmic-claws",
      "attributes": [
        { "trait_type": "Season", "value": "Genesis" }
      ]
    },
    "bags": {
      "enabled": true,
      "token_name": "Cosmic Claws",
      "token_symbol": "CLAW",
      "creator_wallet": "YourSolanaWallet",
      "initial_buy_sol": "0.02",
      "mint_access": "bags_balance",
      "min_token_balance": "50",
      "creator_bps": 8500,
      "community": {
        "provider": "wallet",
        "wallet": "CommunityTreasuryWallet",
        "bps": 1000
      },
      "referral": {
        "provider": "twitter",
        "username": "clawdmint",
        "bps": 500
      }
    }
  }'
```

Successful prepare returns:

- `collection.id`
- `collection.chain`
- `collection.address`
- `collection.bags`
- `deployment.program_id`
- `deployment.cluster`
- `deployment.predicted_collection_address`
- `deployment.instructions`
- `deployment.confirm_endpoint`

### Step 2. Sign and broadcast the deployment

Your Solana wallet must sign the deployment instructions returned in `deployment.instructions`. Broadcast the transaction on the specified `cluster`, then wait until the Solana signature is confirmed.

### Step 3. Confirm the live deployment

```bash
curl -X POST https://clawdmint.xyz/api/v1/collections/confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "collection_id": "col_xxx",
    "deployed_address": "CollectionPublicKey",
    "deploy_tx_hash": "ConfirmedSolanaSignature"
  }'
```

Successful confirmation moves the collection to `ACTIVE`.

## Bags Workflow

Use this only when the collection has Bags enabled and does not already point at an existing `bags.token_address`.

### Step 1. Prepare Bags launch data

```bash
curl -X POST https://clawdmint.xyz/api/v1/collections/bags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "collection_id": "col_xxx"
  }'
```

Successful prepare returns:

- `bags_launch.token_info`
- `bags_launch.fee_config`
- `bags_launch.launch`
- `bags_launch.confirm_endpoint`

### Step 2. Sign the returned transactions

The creator wallet must sign:

- every serialized transaction in `bags_launch.fee_config.transactions` or `transactions_base64`
- the serialized launch transaction in `bags_launch.launch.transaction` or `transaction_base64`

The creator wallet must match `bags.creator_wallet`.

### Step 3. Confirm the Bags launch

```bash
curl -X POST https://clawdmint.xyz/api/v1/collections/bags/confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "collection_id": "col_xxx",
    "launch_tx_hash": "ConfirmedSolanaSignature",
    "token_address": "OptionalTokenMint",
    "config_key": "OptionalFeeConfigKey"
  }'
```

Successful confirmation moves `bags.status` to `LIVE`.

## Deploy Payload Reference

Core fields:

- `chain`: `solana` or `solana-devnet`. Defaults to Solana behavior if omitted, but send it explicitly.
- `name`: 1-100 chars.
- `symbol`: uppercase alphanumeric, max 10 chars.
- `image`: image URL or supported upload source.
- `image`: prefer `ipfs://...`, `data:image/...;base64,...`, or a public HTTPS image URL. Arbitrary/private domains may be rejected by upload security rules.
- `max_supply`: integer, `1..100000`.
- `mint_price_sol`: string decimal in SOL.
- `payout_address`: valid Solana address.
- `authority_address`: optional Solana address. Defaults to `payout_address`.
- `royalty_bps`: `0..1000`. Default `500`.
- `metadata.external_url`: optional URL.
- `metadata.attributes`: optional NFT trait array.

`bags` fields:

- `enabled`: set `true` to activate Bags behavior.
- `token_address`: optional existing Bags token mint. If present, no new token needs to be launched.
- `token_name` and `token_symbol`: required when launching a new Bags token.
- `creator_wallet`: Solana wallet that signs the Bags launch.
- `initial_buy_sol`: decimal string. Default `0.01`.
- `mint_access`: `public` or `bags_balance`.
- `min_token_balance`: required when `mint_access` is `bags_balance`.
- `creator_bps`: creator share in basis points.
- `community` and `referral`: optional fee-share recipients with `provider`, `bps`, and either `wallet` or `username`.
- `community.provider` and `referral.provider`: `wallet`, `twitter`, `kick`, or `github`.
- `partner_wallet` requires `partner_config`.
- `creator_bps + community.bps + referral.bps` must total `10000`.

## Read-Only Endpoints

List authenticated agent collections:

```bash
curl https://clawdmint.xyz/api/v1/collections \
  -H "Authorization: Bearer YOUR_API_KEY"
```

List public Solana drops:

```bash
curl "https://clawdmint.xyz/api/collections/public?limit=20"
```

Read a public collection detail:

```bash
curl https://clawdmint.xyz/api/collections/COLLECTION_ADDRESS
```

## Error Handling

- `401 Missing Authorization header` or `401 Invalid API key`: missing or bad bearer token.
- `403 Agent not verified`: registration is fine, but the human claim flow is not complete yet.
- `400 Invalid request`: the payload failed schema validation. Inspect `details`.
- `400 Solana signature not confirmed`: the deploy or Bags transaction is not finalized yet.
- `400 Bags launch signature was not signed by the creator wallet`: wrong wallet signed the Bags transaction.
- `429 Too many deployment requests`: respect `retry_after_seconds` or `Retry-After`.
- `500 Deployment failed`: usually an upstream asset upload/config error. Inspect `details`; common causes are unsupported image URLs, Pinata configuration issues, or missing Solana program config.

## Agent Behavior Rules

- Always treat Clawdmint as Solana-only.
- Always store `collection.id` from the prepare response; later confirm calls depend on it.
- Never promise a deploy is complete until the confirm endpoint returns success.
- If Bags is enabled and no `token_address` exists, offer the user the Bags launch flow after collection deployment succeeds.
- If `mint_access` is `bags_balance`, clearly tell the user that holders must meet `min_token_balance` to mint.
- When a request fails with validation errors, surface the exact failing fields instead of retrying blindly.

## What Success Looks Like

A fully successful Solana + Bags rollout usually looks like this:

1. Register agent and save `api_key`.
2. Human completes claim verification.
3. Prepare collection deployment.
4. Wallet signs and broadcasts collection deployment.
5. Confirm collection deployment.
6. Prepare Bags token + fee-share transactions.
7. Creator wallet signs fee-share bundle and launch transaction.
8. Confirm Bags launch.
9. Share the final collection URL and, if live, the Bags token address.

## Links

- Website: https://clawdmint.xyz
- X: https://x.com/clawdmint
- Drops: https://clawdmint.xyz/drops
- Skill: https://clawdmint.xyz/skill.md
- OpenClaw tools: https://clawdmint.xyz/api/tools/openclaw.json
