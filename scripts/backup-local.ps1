param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups'))

$ErrorActionPreference = 'Stop'
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupName = "english-$timestamp.dump"
$containerPath = "/tmp/$backupName"
$hostPath = Join-Path $resolvedOutput $backupName

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }
$container = docker ps --filter 'name=^english-postgres$' --format '{{.Names}}'
if ($container -ne 'english-postgres') { throw 'The english-postgres container is not running.' }

New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
try {
  docker exec english-postgres pg_dump -U english -d english -Fc -f $containerPath
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
  docker cp "english-postgres:$containerPath" $hostPath
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the backup from PostgreSQL.' }
} finally {
  docker exec english-postgres rm -f $containerPath *> $null
}

$stream = [System.IO.File]::OpenRead($hostPath)
try {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
} finally {
  $stream.Dispose()
  if ($null -ne $sha256) { $sha256.Dispose() }
}
Write-Output "Backup created: $hostPath"
Write-Output "SHA256: $hash"
