# ClawPEG (cPEG)

ClawPEG is the Solana PEG standard for Clawdmint: a Token-2022 fungible token whose whole-token units map to deterministic, transferable PEG identities.

The goal is to bring the PEG model to Solana without relying on IPFS images or Metaplex assets.

## Standard Version

Current public standard: `cPEG Standard v0.1`.

The v0.1 compatibility surface is:

- Token-2022 mint with the `TransferHook` extension.
- One `PegCollection` PDA per token mint.
- One `OwnerPeg` PDA per collection and owner.
- One `PegRecord` PDA per collection and PEG id.
- Optional `TradeArtRecord` PDAs for routed trades and marketplace fills.
- Stable instruction tags for collection launch, owner sync, PEG mint, PEG transfer, PEG burn, trade-art recording, and escrow release.
- Stable event logs: `PegMinted`, `PegTransferred`, `PegBurned`, `OwnerPegSynced`, `TradeArtGenerated`, `CpegMarketListed`, `CpegMarketSold`, `CpegMarketCancelled`.

Changing PDA seeds, instruction tags, account sizes, or event names requires a new standard version.

## Positioning

Clawdmint is the launchpad for agent-launched PEG assets.

The first collection can be a Clawdmint agent collection, but the protocol is not agent-only. Agents, creators, games, communities, and partners can launch their own cPEG collections with their own renderer rules.

## Core Rule

For a given cPEG collection:

```text
whole units of Token-2022 balance = maximum PEG identities the owner may hold
```

Each PEG identity has:

- a stable `peg_id`
- a deterministic `seed`
- an owner
- optional rarity/indexing metadata derived from the seed
- a renderer config that produces an image without IPFS

The canonical image is not a hosted file. It is:

```text
render(renderer_hash, renderer_version, collection_seed, token_mint, peg_id, seed, params)
```

Cache URLs may exist for speed, but they are not canonical.

## On-Chain Program

The standalone program lives under `solana/programs/clawpeg`.

Required primitives:

- Token-2022 Transfer Hook integration
- Custom PEG registry state
- `PegMinted`
- `PegBurned`
- `PegTransferred`
- `OwnerPeg`
- `transferPeg`
- `syncPeg`

The program does not depend on Metaplex.

## Accounts

### PegCollection

One PDA per launched cPEG collection.

Seeds:

```text
["cpeg", token_mint]
```

Stores:

- authority
- token mint
- collection seed
- renderer hash
- renderer version
- PEG unit amount
- decimals
- max PEG supply
- launch fee config
- creator royalty config
- premium indexing flag

### OwnerPeg

One PDA per collection and wallet.

Seeds:

```text
["owner-peg", collection, owner]
```

Stores:

- owner
- collection
- synced whole-unit capacity
- active PEG count
- generation counter

### PegRecord

One PDA per collection and PEG id.

Seeds:

```text
["peg", collection, peg_id_le]
```

Stores:

- peg id
- seed
- owner
- status: active, burned
- minted slot
- transferred slot

## Transfer Hook Behavior

Token-2022 transfers must include the cPEG extra account metas required by the hook. The validation PDA is the SPL standard:

```text
["extra-account-metas", token_mint]
```

It resolves:

- collection PDA: `["cpeg", mint]`
- source `OwnerPeg`: `["owner-peg", collection, source_token_account.owner]`
- destination `OwnerPeg`: `["owner-peg", collection, destination_token_account.owner]`

The hook verifies:

- source and destination token accounts match the cPEG mint
- collection account matches the mint
- registry accounts are owned by the cPEG program
- PEG count never exceeds whole-token capacity

The hook is responsible for enforcing the standard. If a transfer would leave a wallet with more active PEG identities than whole-token balance, it rejects the transfer.

## `syncPeg`

`syncPeg` reconciles a wallet's Token-2022 balance with its PEG registry.

If whole balance increases:

- mint missing PEG identities
- emit `PegMinted`

If whole balance decreases:

- burn or detach excess PEG identities according to collection policy
- emit `PegBurned`

The MVP policy requires explicit PEG creation/transfer/burn instructions. Automatic tail burn can be added later as a collection policy, but it is not required for the core transfer hook.

## `transferPeg`

`transferPeg` moves a specific PEG identity from one owner registry to another and atomically CPIs into Token-2022 `transfer_checked` for exactly one `peg_unit`.

It is valid only when:

- source owns the PEG
- source signs
- source and destination token accounts match the cPEG mint
- the SPL hook validation PDA is initialized
- the Token-2022 transfer hook accepts the final source/destination capacity state

The registry update happens before the CPI. If the Token-2022 transfer or hook rejects, Solana rolls back the full instruction.

## Renderer Registry

The launchpad stores renderer configs as deterministic rules, not image files.

Renderer config includes:

- renderer id
- renderer version
- renderer hash
- collection seed
- param schema
- rarity curve
- fee tier

MVP renderers are curated and parameterized. Custom renderer uploads come later through a reviewed Renderer SDK.

## Revenue Model

ClawPEG supports:

- PEG launch fee
- marketplace fee
- creator royalty
- premium rarity/indexing tools
- partner/agent launch API
- white-label PEG launch for communities

P2P escrow marketplace is a separate product and does not sit in the critical PEG launch/sync path.

## Trade Router

The official cPEG trade router surface is responsible for trade-art emission.

For mainnet AMM routes, the router prepares an aggregator swap and appends `record_trade_art` to the same transaction when the route can fit inside Solana transaction limits.

For escrow routes, marketplace buy and floor-sweep instructions call the market program, which atomically releases the PEG and records a `TradeArtRecord`.

If a trade bypasses the official cPEG router, cPEG ownership remains valid through the Token-2022 hook, but trade art is not guaranteed.

### Identity-Backed Sell Adapter

The `/swap` sell flow is identity-backed. The seller must pick a specific PEG id.

The adapter path is:

1. Verify `PegRecord.owner == seller`.
2. Create market escrow listing for that exact PEG.
3. Confirm listing on-chain and index it.

Current endpoint:

```text
POST /api/cpeg/{mint}/dex/sell/prepare
```

This preserves PEG identity correctness. Generic token sells without identity selection are not used.

## Creator Operations

Launch owner operations are tracked with a post-launch readiness panel.

Required sequence:

1. Mint initial supply
2. Assign initial PEGs (`syncPeg` + `mintPeg`)
3. Add DEX liquidity
4. Open market listings
5. Optionally seal mint authority

Readiness checks include:

- Token-2022 status
- Transfer hook match
- Metadata initialized
- Supply minted
- PEG assignments present
- Market open
- Route availability
- Orca and Meteora candidate status
- Sealed or unsealed mint authority

## Indexer and Drift

Indexer persistence is part of `cPEG Standard v0.1` operations.

Event scan and persist:

```text
GET  /api/cpeg/indexer/events?program=standard|market
GET  /api/cpeg/indexer/events?source=db
POST /api/cpeg/indexer/sync
```

OwnerPeg drift check:

```text
GET /api/cpeg/{mint}/ownership/drift?owner={wallet}
```

Drift is raised when `OwnerPeg.synced_capacity` does not match whole token units.

## Route Strategy

Preferred:

```text
cpeg.clawdmint.xyz
```

Fallback inside the current app:

```text
/cpeg
```

P2P marketplace:

```text
cpeg.clawdmint.xyz/market
```

or fallback:

```text
/cpeg/market
```

## Mainnet Readiness Checklist

- Program upgrade authority policy documented and restricted
- Mint authority sealing policy documented per collection
- Transfer hook and metadata verified on-chain
- DEX routing candidate checks reviewed
- Small-liquidity dry run completed before full launch
