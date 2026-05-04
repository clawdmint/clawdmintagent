$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$solanaDir = Join-Path $repo "solana"
$bin = Join-Path $env:USERPROFILE ".local\share\solana\install\releases\1.18.17\bin"
$log = Join-Path $repo "clawpeg-admin-build.log"

$env:HOME = $env:USERPROFILE
$env:Path = "$bin;$env:Path"

Push-Location $solanaDir
try {
  "Starting ClawPEG SBF build at $(Get-Date -Format o)" | Out-File -FilePath $log -Encoding utf8
  "Using Solana bin: $bin" | Out-File -FilePath $log -Encoding utf8 -Append
  "Step: solana version" | Out-File -FilePath $log -Encoding utf8 -Append
  & (Join-Path $bin "solana.exe") --version *>&1 | Tee-Object -FilePath $log -Append
  "Step: cargo-build-sbf version" | Out-File -FilePath $log -Encoding utf8 -Append
  & (Join-Path $bin "cargo-build-sbf.exe") --version *>&1 | Tee-Object -FilePath $log -Append
  "Step: cargo-build-sbf build" | Out-File -FilePath $log -Encoding utf8 -Append
  & (Join-Path $bin "cargo-build-sbf.exe") --manifest-path programs/clawpeg/Cargo.toml *>&1 | Tee-Object -FilePath $log -Append
  "ExitCode: $LASTEXITCODE" | Out-File -FilePath $log -Encoding utf8 -Append
  if ($LASTEXITCODE -ne 0) {
    throw "cargo-build-sbf failed with exit code $LASTEXITCODE"
  }
  "Finished ClawPEG SBF build at $(Get-Date -Format o)" | Out-File -FilePath $log -Encoding utf8 -Append
}
catch {
  "ERROR: $($_.Exception.Message)" | Out-File -FilePath $log -Encoding utf8 -Append
  throw
}
finally {
  Pop-Location
}
