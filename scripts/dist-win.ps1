$ErrorActionPreference = 'Stop'

$appDirectory = Split-Path -Parent $PSScriptRoot
$env:ELECTRON_CACHE = Join-Path $appDirectory 'tmp/electron-cache'
$env:ELECTRON_BUILDER_CACHE = Join-Path $appDirectory 'tmp/builder-cache'

pnpm exec electron-builder --win nsis --x64
exit $LASTEXITCODE
