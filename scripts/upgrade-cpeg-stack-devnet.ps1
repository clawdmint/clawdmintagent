param(
  [Parameter(Mandatory = $true)]
  [string]$UpgradeAuthorityKeypair,

  [string]$FeePayerKeypair = "",
  [string]$Cluster = "devnet",
  [string]$ClawpegProgramId = "AfL9FC6ZzHXF2QBgyJ5vCNs3i8sVM8fJwZDuyHTNCE6X",
  [string]$CpegMarketProgramId = "5JjQCptH1h5VAJPPeLDa5hDkNo3LvmjNwH3J3GJgTVZy",
  [int]$GrowthBufferBytes = 65536,
  [int]$MaxSignAttempts = 20,
  [int]$ComputeUnitPrice = 1000
)

# Orchestrator that upgrades the full cPEG on-chain stack in the correct order:
#
#   1. clawdmint-solana (clawpeg)   - hosts the idempotent record_trade_art instruction
#   2. cpeg-market                  - buys now CPI into record_trade_art on every fill
#
# The order matters: cpeg-market's buy() invokes clawpeg::record_trade_art via CPI, so the
# idempotency guard in clawpeg should be live first to avoid bricking buys if a manual
# trade-art entry happens to share the same trade_index as a peg_id.

$ErrorActionPreference = "Stop"

if ($FeePayerKeypair -eq "") {
  $FeePayerKeypair = $UpgradeAuthorityKeypair
}

$scriptDir = $PSScriptRoot
$clawpegScript = Join-Path $scriptDir "upgrade-afl9-clawpeg-devnet.ps1"
$marketScript = Join-Path $scriptDir "upgrade-cpeg-market-devnet.ps1"

Write-Host ""
Write-Host "==========================================================="
Write-Host "Step 1/2: clawdmint-solana (clawpeg) -> $ClawpegProgramId"
Write-Host "==========================================================="
Write-Host ""

& $clawpegScript `
  -UpgradeAuthorityKeypair $UpgradeAuthorityKeypair `
  -FeePayerKeypair $FeePayerKeypair `
  -Cluster $Cluster `
  -ProgramId $ClawpegProgramId `
  -GrowthBufferBytes $GrowthBufferBytes `
  -MaxSignAttempts $MaxSignAttempts `
  -ComputeUnitPrice $ComputeUnitPrice

if ($LASTEXITCODE -ne 0) {
  throw "clawpeg upgrade failed; aborting before cpeg-market upgrade."
}

Write-Host ""
Write-Host "==========================================================="
Write-Host "Step 2/2: cpeg-market                -> $CpegMarketProgramId"
Write-Host "==========================================================="
Write-Host ""

& $marketScript `
  -UpgradeAuthorityKeypair $UpgradeAuthorityKeypair `
  -FeePayerKeypair $FeePayerKeypair `
  -Cluster $Cluster `
  -ProgramId $CpegMarketProgramId `
  -GrowthBufferBytes $GrowthBufferBytes `
  -MaxSignAttempts $MaxSignAttempts `
  -ComputeUnitPrice $ComputeUnitPrice

if ($LASTEXITCODE -ne 0) {
  throw "cpeg-market upgrade failed."
}

Write-Host ""
Write-Host "Both programs upgraded. Trade-art is now atomically recorded on every market fill."
Write-Host "Verify on-chain via: solana program show $ClawpegProgramId --url $Cluster"
Write-Host "                     solana program show $CpegMarketProgramId --url $Cluster"
