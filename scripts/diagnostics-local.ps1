$ErrorActionPreference = 'Continue'
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
  $checks.Add([pscustomobject]@{ check = $Name; passed = $Passed; detail = $Detail })
}

docker info *> $null
$dockerReady = $LASTEXITCODE -eq 0
Add-Check 'Docker' $dockerReady $(if ($dockerReady) { 'Docker engine is available.' } else { 'Start Docker Desktop.' })
if ($dockerReady) {
  $health = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' english-postgres 2>$null
  Add-Check 'PostgreSQL container' ($health -eq 'healthy') "Container status: $health"
} else { Add-Check 'PostgreSQL container' $false 'Skipped because Docker is unavailable.' }

try {
  $api = Invoke-RestMethod 'http://localhost:3001/api/v1/health' -TimeoutSec 3
  Add-Check 'API' ($api.status -eq 'ok') "API status: $($api.status)"
} catch { Add-Check 'API' $false 'API is not responding on port 3001.' }
try {
  $web = Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing -TimeoutSec 3
  Add-Check 'Web' ($web.StatusCode -eq 200) "HTTP status: $($web.StatusCode)"
} catch { Add-Check 'Web' $false 'Web app is not responding on port 3000.' }

$checks | Format-Table -AutoSize
if ($checks.Where({ -not $_.passed }).Count -gt 0) { exit 1 }
