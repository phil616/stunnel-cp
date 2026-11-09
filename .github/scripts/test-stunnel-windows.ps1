# Test the official native Console CLI with the exact exported Windows bundles.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$version = '5.82'
$filename = "stunnel-$version-win64-installer.exe"
$uri = "https://www.stunnel.org/downloads/$filename"
$root = Join-Path $env:RUNNER_TEMP "stunnel-$version"
New-Item -ItemType Directory -Force -Path $root | Out-Null
$installer = Join-Path $root $filename
Invoke-WebRequest -Uri $uri -OutFile $installer -TimeoutSec 90 -UserAgent 'Mozilla/5.0'
# Pinned from the official 5.82 .sha256 sidecar; update together with the version.
$expected = '722c1ad626919af2b0034666b4d19cc4795e925c32f60e8f3c59af4fb3ad2dfc'
$actual = (Get-FileHash -Algorithm SHA256 -Path $installer).Hash
if ($actual -ne $expected) { throw 'Official stunnel installer checksum mismatch' }
# Extract every optional component, including tstunnel.exe, without installing a service.
& 7z x $installer "-o$root\extracted" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot extract official stunnel installer' }
$console = @(Get-ChildItem -Path "$root\extracted" -Recurse -Filter tstunnel.exe)
if ($console.Count -ne 1) { throw "Expected exactly one native console executable; found $($console.Count)" }
# Keep the EXE in its original bin directory alongside its matching OpenSSL/runtime DLLs.
$env:STCP_STUNNEL_BIN = $console[0].FullName
Write-Host "Testing native Console CLI: $env:STCP_STUNNEL_BIN"
& go test ./internal/service -run '^TestStunnelMTLS$' -count=1 -v -timeout 2m
if ($LASTEXITCODE -ne 0) { throw 'Native Windows stunnel integration failed' }
