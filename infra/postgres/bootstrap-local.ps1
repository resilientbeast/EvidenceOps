[CmdletBinding()]
param(
  [string]$ContainerName = "incident-doppelganger-postgres",
  [string]$Image = "pgvector/pgvector:pg16",
  [string]$DatabaseName = "incident_doppelganger",
  [string]$UserName = "incident_app",
  [int]$HostPort = 5433,
  [int]$ApiPort = 5434
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$environmentPath = Join-Path $repositoryRoot ".env.local"
$connectionKey = "POSTGRES_MEMORY_URL="
$apiKey = "POSTGRES_MEMORY_API_URL="
$existingConnection = if (Test-Path -LiteralPath $environmentPath) {
  Get-Content -LiteralPath $environmentPath | Where-Object { $_.StartsWith($connectionKey) } | Select-Object -First 1
}

if ($existingConnection) {
  throw "POSTGRES_MEMORY_URL is already configured. Refusing to replace an existing local memory connection."
}

$password = [guid]::NewGuid().ToString("N")
$existing = & docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}"
if ($existing) {
  throw "A container named $ContainerName already exists. Refusing to replace its data volume."
}

& docker run --detach `
  --name $ContainerName `
  --publish "127.0.0.1:$HostPort`:5432" `
  --volume "$ContainerName-data:/var/lib/postgresql/data" `
  --env "POSTGRES_DB=$DatabaseName" `
  --env "POSTGRES_USER=$UserName" `
  --env "POSTGRES_PASSWORD=$password" `
  $Image

$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
  & docker exec $ContainerName pg_isready --username $UserName --dbname $DatabaseName | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw "PostgreSQL did not become ready within 30 seconds. Check docker logs $ContainerName." }

Add-Content -LiteralPath $environmentPath -Value "`n$connectionKey`postgresql://$UserName`:$password@localhost`:$HostPort/$DatabaseName"
Add-Content -LiteralPath $environmentPath -Value "$apiKey`http://127.0.0.1:$ApiPort"
Write-Host "PostgreSQL agent memory is ready and configured in .env.local. Run npm run postgres:api, restart the app, load it once, then run npm run postgres:smoke."
