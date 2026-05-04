param(
  [Parameter(Mandatory = $true)]
  [string]$UpgradeAuthorityKeypair,

  [string]$FeePayerKeypair = "",
  [string]$Cluster = "devnet",
  [string]$ProgramId = "AfL9FC6ZzHXF2QBgyJ5vCNs3i8sVM8fJwZDuyHTNCE6X",
  [string]$ProgramPath = "target/deploy/clawdmint_solana.so",
  [int]$GrowthBufferBytes = 65536,
  [int]$MaxSignAttempts = 20,
  [int]$ComputeUnitPrice = 1000
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$solanaDir = Join-Path $repo "solana"
$bin = Join-Path $env:USERPROFILE ".local\share\solana\install\releases\1.18.17\bin"
$solana = Join-Path $bin "solana.exe"
$cargoBuildSbf = Join-Path $bin "cargo-build-sbf.exe"

if (-not (Test-Path -LiteralPath $UpgradeAuthorityKeypair)) {
  throw "Upgrade authority keypair file was not found."
}

if ($FeePayerKeypair -eq "") {
  $FeePayerKeypair = $UpgradeAuthorityKeypair
}

if (-not (Test-Path -LiteralPath $FeePayerKeypair)) {
  throw "Fee payer keypair file was not found."
}

$env:HOME = $env:USERPROFILE
$env:Path = "$bin;$env:Path"

Push-Location $solanaDir
try {
  & $cargoBuildSbf --manifest-path programs/clawdmint-solana/Cargo.toml
  if ($LASTEXITCODE -ne 0) {
    throw "cargo-build-sbf failed."
  }

  $resolvedProgramPath = Resolve-Path -LiteralPath $ProgramPath
  $artifactBytes = (Get-Item -LiteralPath $resolvedProgramPath).Length
  $programJson = & $solana program show $ProgramId --url $Cluster --keypair $FeePayerKeypair --output json | ConvertFrom-Json
  $currentBytes = [int64]$programJson.dataLen

  if (-not $currentBytes) {
    $showText = & $solana program show $ProgramId --url $Cluster --keypair $FeePayerKeypair
    $dataLengthLine = $showText | Where-Object { $_ -match "Data Length:" } | Select-Object -First 1
    if ($dataLengthLine -match "Data Length:\s+([0-9]+)") {
      $currentBytes = [int64]$Matches[1]
    }
  }

  if ($artifactBytes -gt $currentBytes) {
    $additionalBytes = [int]($artifactBytes - $currentBytes + $GrowthBufferBytes)
    & $solana program extend $ProgramId $additionalBytes --url $Cluster --keypair $UpgradeAuthorityKeypair
    if ($LASTEXITCODE -ne 0) {
      throw "program extend failed."
    }
  }

  & $solana program deploy $resolvedProgramPath `
    --program-id $ProgramId `
    --upgrade-authority $UpgradeAuthorityKeypair `
    --keypair $FeePayerKeypair `
    --fee-payer $FeePayerKeypair `
    --url $Cluster `
    --max-len ($artifactBytes + $GrowthBufferBytes) `
    --max-sign-attempts $MaxSignAttempts `
    --with-compute-unit-price $ComputeUnitPrice `
    --use-rpc

  if ($LASTEXITCODE -ne 0) {
    throw "program deploy failed."
  }

  & $solana program show $ProgramId --url $Cluster --keypair $FeePayerKeypair
}
finally {
  Pop-Location
}
