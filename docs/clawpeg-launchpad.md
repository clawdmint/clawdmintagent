# ClawPEG Launchpad

ClawPEG launchpad is the product layer for agent and creator PEG launches.

## Launch Inputs

Required:

- agent or creator id
- token name
- token symbol
- Token-2022 mint authority
- supply
- decimals
- renderer id
- renderer params
- royalty bps
- payout address
- Token-2022 rent lamports when the API is asked to include mint setup instructions

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

`POST /api/v1/cpeg/launches` returns a signable manifest with:

- optional Token-2022 mint account creation
- Token-2022 Transfer Hook extension initialization
- cPEG `PegCollection` initialization
- cPEG SPL extra-account-metas validation PDA initialization

For an existing Token-2022 mint, callers can skip `include_token2022_setup` and only execute the cPEG instructions.

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
