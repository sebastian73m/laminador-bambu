param([string]$BambuStudioPath = $env:BAMBU_STUDIO_PATH, [string]$ProjectsDir = $env:PROJECTS_DIR, [switch]$Stdio)
$ErrorActionPreference = 'Stop'
$LaminadorRoot = Split-Path -Parent $PSScriptRoot
Set-Location $LaminadorRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instala Node.js >=22.12 antes de continuar.' }
if ($BambuStudioPath) { $env:BAMBU_STUDIO_PATH = $BambuStudioPath }
if (-not $ProjectsDir) { $ProjectsDir = Join-Path $LaminadorRoot 'projects' }
$env:PROJECTS_DIR = $ProjectsDir
New-Item -ItemType Directory -Force -Path $ProjectsDir | Out-Null
if (-not (Test-Path (Join-Path $LaminadorRoot 'node_modules'))) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci' }
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación' }
if ($Stdio) { & node dist/server.js --stdio } else { & node dist/server.js }
exit $LASTEXITCODE
