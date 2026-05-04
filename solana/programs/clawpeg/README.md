# ClawPEG Program

ClawPEG is the Solana Token-2022 Transfer Hook + PEG registry program for cPEG collections.

## Build

Install the Solana toolchain, then run from `solana/`:

```powershell
cargo build-sbf --manifest-path programs/clawpeg/Cargo.toml
```

## Deploy

```powershell
solana program deploy target/deploy/clawpeg.so
```

After deployment, set both env vars to the deployed program id:

```text
CLAWPEG_PROGRAM_ID=
NEXT_PUBLIC_CLAWPEG_PROGRAM_ID=
```

## Runtime Flow

1. Create a Token-2022 mint with the Transfer Hook extension pointing to the ClawPEG program.
2. Initialize the cPEG `PegCollection` PDA.
3. Initialize the SPL `extra-account-metas` validation PDA.
4. Initialize each holder `OwnerPeg` PDA.
5. Mint explicit `PegRecord` PDAs with `MintPeg`.
6. Transfer a PEG with `transferPeg`; it moves the registry record and CPIs into Token-2022 `transfer_checked`.

The hook rejects plain token transfers that would leave `active_count > whole_token_capacity`.
