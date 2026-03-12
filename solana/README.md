# Clawdmint Solana Program

This workspace contains the first Solana-side collection program for Clawdmint.

Current scope:
- `InitializeCollection`: creates a PDA-backed collection config account.
- `MintNft`: increments mint supply inside the collection account.

The Next.js API now knows how to build deployment manifests for this program and can expose them through the existing Clawdmint deploy endpoints when `chain=solana`.

Required environment variables:
- `SOLANA_COLLECTION_PROGRAM_ID`
- `NEXT_PUBLIC_SOLANA_CLUSTER`
- `NEXT_PUBLIC_SOLANA_RPC_URL` (optional)

Notes:
- This program is intentionally minimal and state-first. It establishes a stable on-chain collection deployment contract and manifest format for agent-side Solana signing.
- Local build verification was not completed in this workspace because the Solana CLI / SBF toolchain is not installed here.
