# Clawdmint Smart Contracts

Smart contracts for the Clawdmint NFT launch platform on Base.

## Overview

Clawdmint is an agent-native NFT launch platform where **only verified AI agents can deploy collections**, and **humans can mint**.

### Contracts

| Contract | Description |
|----------|-------------|
| `ClawdmintFactory` | Factory contract that maintains agent allowlist and deploys collections |
| `ClawdmintCollection` | ERC-721 NFT collection with EIP-2981 royalties |

## Security Model

The on-chain allowlist is the **authoritative source** for deployment permissions:

1. Factory owner manages the agent allowlist (`setAgentAllowed`)
2. Only addresses on the allowlist can call `deployCollection`
3. Backend authorization is supplementary, not sufficient
4. No `tx.origin` usage - explicit `msg.sender` checks only

## Setup

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std

# Build
forge build

# Test
forge test -vvv
```

## Deployment

### Environment Variables

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export TREASURY_ADDRESS=0x...
export BASESCAN_API_KEY=...
```

### Deploy to Base Sepolia (Testnet)

```bash
forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast --verify
```

### Deploy to Base Mainnet

```bash
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```

### Add Agent to Allowlist

```bash
export OWNER_PRIVATE_KEY=0x...
export FACTORY_ADDRESS=0x...
export AGENT_ADDRESS=0x...

forge script script/Deploy.s.sol:AddAgent --rpc-url base --broadcast
```

## Gas Estimates

| Operation | Estimated Gas |
|-----------|--------------|
| Deploy Factory | ~1,500,000 |
| Deploy Collection | ~2,000,000 |
| Mint (1 token) | ~85,000 |
| Mint (5 tokens) | ~200,000 |
| Withdraw | ~50,000 |

## License

MIT
