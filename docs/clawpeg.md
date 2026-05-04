# ClawPEG (cPEG)

ClawPEG is the Solana PEG standard for Clawdmint: a Token-2022 fungible token whose whole-token units map to deterministic, transferable PEG identities.

The goal is to bring the uPEG idea to Solana without relying on IPFS images or Metaplex assets.

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
