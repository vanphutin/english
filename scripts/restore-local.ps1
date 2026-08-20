param(
  [Parameter(Mandatory = $true)][string]$BackupPath,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) {
  throw 'Restore replaces the current local database. Run again with -ConfirmRestore after checking the backup path.'
}
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
if ([System.IO.Path]::GetExtension($resolvedBackup) -ne '.dump') {
  throw 'Only PostgreSQL custom-format .dump backups are accepted.'
}

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }
$container = docker ps --filter 'name=^english-postgres$' --format '{{.Names}}'
if ($container -ne 'english-postgres') { throw 'The english-postgres container is not running.' }

# A restore is destructive, so create a recoverable checkpoint before changing the database.
& (Join-Path $PSScriptRoot 'backup-local.ps1')
if ($LASTEXITCODE -ne 0) { throw 'The safety backup failed; restore was cancelled.' }

$containerPath = "/tmp/english-restore-$([Guid]::NewGuid().ToString('N')).dump"
try {
  docker cp $resolvedBackup "english-postgres:$containerPath"
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the backup into PostgreSQL.' }
  docker exec english-postgres pg_restore -U english -d english --clean --if-exists --no-owner --no-privileges $containerPath
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed. The pre-restore safety backup is available in backups/.' }
} finally {
  docker exec english-postgres rm -f $containerPath *> $null
}
Write-Output "Restore completed from: $resolvedBackup"
