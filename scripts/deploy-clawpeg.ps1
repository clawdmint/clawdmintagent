param(
  [string]$Cluster = "devnet",
  [string]$ProgramPath = "target/deploy/clawpeg.so"
)

$ErrorActionPreference = "Stop"

Push-Location "$PSScriptRoot\..\solana"
try {
  if (-not (Get-Command solana -ErrorAction SilentlyContinue)) {
    throw "Solana CLI is not installed or not on PATH."
  }
  if (-not (Get-Command cargo-build-sbf -ErrorAction SilentlyContinue)) {
    throw "cargo-build-sbf is not installed. Install the Solana toolchain before deploying."
  }

  solana config set --url $Cluster
  cargo build-sbf --manifest-path programs/clawpeg/Cargo.toml
  solana program deploy $ProgramPath
}
finally {
  Pop-Location
}
