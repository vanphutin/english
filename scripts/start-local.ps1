$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  $dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path -LiteralPath $dockerDesktop)) { throw 'Docker Desktop is not installed in the expected location.' }
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(60)
  do {
    Start-Sleep -Seconds 2
    docker info *> $null
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop did not become ready within 60 seconds.' }
}

pnpm db:up
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL failed to start.' }
pnpm db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
Write-Output 'Starting Grammar Path at http://localhost:3000'
pnpm dev
