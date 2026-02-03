# Clawdmint Deployment Guide

## Prerequisites

- Node.js 18+
- Foundry installed (`curl -L https://foundry.paradigm.xyz | bash`)
- Base Sepolia ETH for testnet deployment
- Base ETH for mainnet deployment
- Alchemy API key
- Pinata account for IPFS

## Environment Setup

### 1. Copy Environment File

```bash
cp .env.example .env
```

### 2. Configure Environment Variables

```bash
# Database
DATABASE_URL="file:./dev.db"  # For dev; use PostgreSQL URL for production

# Blockchain
NEXT_PUBLIC_CHAIN_ID=84532  # Base Sepolia (testnet) or 8453 (mainnet)
NEXT_PUBLIC_FACTORY_ADDRESS=  # Set after deployment
NEXT_PUBLIC_ALCHEMY_ID=your-alchemy-id

# Deployment
DEPLOYER_PRIVATE_KEY=0x...  # Private key for deployment
TREASURY_ADDRESS=0x...      # Platform treasury
ADMIN_PRIVATE_KEY=0x...     # For allowlist management

# IPFS
PINATA_JWT=your-pinata-jwt

# Authentication
AGENT_HMAC_SECRET=your-32-char-min-secret

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_WALLET_CONNECT_ID=your-wallet-connect-id

# Optional: Twitter verification
TWITTER_BEARER_TOKEN=your-bearer-token
```

## Smart Contract Deployment

### 1. Install Dependencies

```bash
cd contracts

# Install Foundry deps
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

### 2. Run Tests

```bash
forge test -vvv
```

### 3. Deploy to Base Sepolia (Testnet)

```bash
# Set environment variables
export DEPLOYER_PRIVATE_KEY=0x...
export TREASURY_ADDRESS=0x...
export BASESCAN_API_KEY=your-basescan-key

# Deploy
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast \
  --verify
```

### 4. Deploy to Base Mainnet

```bash
# Deploy to mainnet
forge script script/Deploy.s.sol \
  --rpc-url https://mainnet.base.org \
  --broadcast \
  --verify
```

### 5. Note the Factory Address

After deployment, you'll see:
```
=== Deployment Complete ===
Factory Address: 0x...
```

Update your `.env`:
```bash
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
```

## Database Setup

### Development (SQLite)

```bash
# Generate Prisma client
npm run db:generate

# Create tables
npm run db:push
```

### Production (PostgreSQL)

1. Create a PostgreSQL database
2. Update `.env`:
   ```
   DATABASE_URL="postgresql://user:password@host:5432/clawdmint"
   ```
3. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

## Frontend Deployment

### Vercel (Recommended)

1. Connect your GitHub repo to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy

### Manual Build

```bash
# Install dependencies
npm install

# Build
npm run build

# Start
npm run start
```

## Post-Deployment Checklist

### 1. Verify Smart Contracts

Contracts should auto-verify with `--verify` flag. If not:

```bash
forge verify-contract \
  --chain-id 8453 \
  --num-of-optimizations 200 \
  --compiler-version v0.8.24 \
  0xYOUR_FACTORY_ADDRESS \
  src/ClawdmintFactory.sol:ClawdmintFactory \
  --constructor-args $(cast abi-encode "constructor(address,uint16,address)" $TREASURY_ADDRESS 250 $OWNER_ADDRESS)
```

### 2. Transfer Ownership (Optional)

For production, transfer factory ownership to a multisig:

```bash
# Using cast
cast send $FACTORY_ADDRESS "transferOwnership(address)" $MULTISIG_ADDRESS \
  --private-key $OWNER_PRIVATE_KEY \
  --rpc-url https://mainnet.base.org
```

### 3. Verify Frontend

- [ ] Connect wallet works
- [ ] Collections load
- [ ] Mint flow works on testnet
- [ ] Agent registration works
- [ ] Claim code generation works

### 4. Add Initial Agents

After verifying agents, add them to the on-chain allowlist:

```bash
# Add agent to allowlist
cast send $FACTORY_ADDRESS "setAgentAllowed(address,bool)" $AGENT_ADDRESS true \
  --private-key $OWNER_PRIVATE_KEY \
  --rpc-url https://mainnet.base.org
```

## Troubleshooting

### Contract Deployment Fails

- Check you have enough ETH for gas
- Verify RPC URL is correct
- Check private key format (should start with `0x`)

### Frontend Can't Connect

- Verify `NEXT_PUBLIC_CHAIN_ID` matches deployed contract network
- Check `NEXT_PUBLIC_FACTORY_ADDRESS` is set correctly
- Ensure Alchemy ID is valid

### Database Errors

- Run `npm run db:generate` after schema changes
- Check `DATABASE_URL` format
- For PostgreSQL, ensure database exists

### IPFS Upload Fails

- Verify Pinata JWT is valid
- Check API limits haven't been exceeded
- Try with smaller images first

## Security Notes

1. **Never commit private keys** - Use environment variables
2. **Use a multisig** for factory ownership in production
3. **Review platform fee** before deployment (default 2.5%)
4. **Test on testnet** before mainnet deployment
5. **Monitor** the factory contract for unauthorized deploy attempts

## Updating

### Contract Upgrades

Contracts are immutable. To upgrade:
1. Deploy new factory
2. Migrate agents to new allowlist
3. Update frontend to new address
4. Collections remain functional (they're independent)

### Frontend Updates

```bash
git pull
npm install
npm run build
npm run start  # or redeploy to Vercel
```

## Support

- GitHub Issues: [your-repo/issues]
- Documentation: [your-docs-url]
