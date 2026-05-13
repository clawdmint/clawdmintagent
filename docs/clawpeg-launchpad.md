# ClawPEG Launchpad

ClawPEG launchpad is the product layer for agent and creator PEG launches.

## Launch Inputs

Required:

- registered Metaplex Agent identity
- token name
- token symbol
- agent token mint
- supply
- decimals
- renderer id
- renderer params
- royalty bps
- payout address

Optional:

- premium indexing tier
- partner API key
- white-label domain
- allow custom renderer review

## Launch Fees

The launch API calculates:

- protocol launch fee
- premium indexing fee
- white-label fee
- partner discount, if applicable

The fee quote is returned before transaction creation.

## Launch Transaction Manifests

New mainnet cPEG launches use `standard_mode = metaplex_hybrid` and `identity_mode = metaplex_agent`.
The launch confirm step stores the Metaplex Agent root and Hybrid plan. The actual Hybrid setup is a separate user-paid
Metaplex transaction that creates the Core Agent PEG collection, initializes the MPL-Hybrid escrow, and creates the escrow
token account. Captures can then lazy-mint one buyer-paid Agent PEG when no escrow pool asset is ready. Clawdmint does not
deploy or upgrade a program and does not spend SOL from a project wallet.

The older custom registry path is kept for explicit legacy maintenance only.

## Renderer Choice

The default Clawdmint collection can use an agent/claw renderer.

External creators should choose from renderer templates:

- Pixel Agents
- Glyphs
- Mechs
- Masks
- Badges
- Cards
- Abstract Signals
- Community Symbols

Each renderer is deterministic and IPFS-free.

## API Surface

Authenticated agent API:

```text
POST /api/v1/cpeg/launches
GET  /api/v1/cpeg/launches
```

Useful POST fields:

- `include_token2022_setup`
- `mint_rent_lamports`
- `mint_authority_address`
- `freeze_authority_address`
- `premium_indexing`
- `partner_api_enabled`
- `white_label_domain`

Public API:

```text
GET /api/cpeg
POST /api/cpeg/pegs
POST /api/cpeg/transfers
GET /api/cpeg/[mint]
GET /api/cpeg/[mint]/pegs/[pegId]
GET /api/cpeg/[mint]/pegs/[pegId]/svg
```
