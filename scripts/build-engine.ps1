$ErrorActionPreference = 'Stop'
$LaminadorRoot = Split-Path -Parent $PSScriptRoot
$LaminadorEngine = Join-Path $LaminadorRoot '.engine/source'
$Revision = Get-Content (Join-Path $PSScriptRoot 'engine-revision.json') -Raw | ConvertFrom-Json
foreach ($Tool in @('git', 'cmake', 'node')) { if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) { throw "Falta $Tool" } }
if (-not (Test-Path (Join-Path $LaminadorEngine '.git'))) {
    New-Item -ItemType Directory -Force -Path (Join-Path $LaminadorRoot '.engine') | Out-Null
    & git clone --depth 1 --branch $Revision.tag $Revision.repository $LaminadorEngine
    if ($LASTEXITCODE -ne 0) { throw 'Falló la descarga del código fuente' }
}
$Actual = & git -C $LaminadorEngine rev-parse HEAD
if ($Actual.Trim() -ne $Revision.commit) { throw 'La revisión del motor no coincide' }
$Changes = & git -C $LaminadorEngine status --porcelain
if ($Changes) { throw 'El código del motor tiene cambios locales; se conserva' }
Push-Location $LaminadorEngine
try {
    # Run from a Visual Studio developer shell with C++ workload and Windows SDK.
    & .\build_win.bat -CONFIG Release -STEPS all -RUN none
    if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación de Bambu Studio' }
} finally { Pop-Location }
Write-Host 'Busca bambu-studio-console.exe o bambu-studio.exe en .engine/source/build y configura BAMBU_STUDIO_PATH.'
