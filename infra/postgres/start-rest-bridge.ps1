[CmdletBinding()]
param(
  [string]$DatabaseContainerName = "incident-doppelganger-postgres",
  [string]$BridgeContainerName = "incident-doppelganger-postgrest",
  [string]$Image = "postgrest/postgrest:v12.2.12",
  [int]$HostPort = 5434
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$environmentPath = Join-Path $repositoryRoot ".env.local"
$connectionLine = Get-Content -LiteralPath $environmentPath | Where-Object { $_.StartsWith("POSTGRES_MEMORY_URL=") } | Select-Object -First 1
if (-not $connectionLine) { throw "POSTGRES_MEMORY_URL is required. Run npm run postgres:bootstrap first." }

$connectionUri = [uri]$connectionLine.Substring("POSTGRES_MEMORY_URL=".Length)
$databaseUser = $connectionUri.UserInfo.Split(":")[0]
$databasePassword = $connectionUri.UserInfo.Substring($databaseUser.Length + 1)
$databaseName = $connectionUri.AbsolutePath.TrimStart("/")
$apiLine = Get-Content -LiteralPath $environmentPath | Where-Object { $_.StartsWith("POSTGRES_MEMORY_API_URL=") } | Select-Object -First 1
if (-not $apiLine) {
  Add-Content -LiteralPath $environmentPath -Value "`nPOSTGRES_MEMORY_API_URL=http://127.0.0.1:$HostPort"
}

$databaseExists = & docker ps --filter "name=^/$DatabaseContainerName$" --format "{{.Names}}"
if (-not $databaseExists) { throw "The local PostgreSQL container '$DatabaseContainerName' is not running." }

$bridgeExists = & docker ps -a --filter "name=^/$BridgeContainerName$" --format "{{.Names}}"
if ($bridgeExists) {
  & docker start $BridgeContainerName | Out-Null
  Write-Host "PostgreSQL REST bridge is running at http://127.0.0.1:$HostPort."
  exit 0
}

$grantSql = @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'incident_api') THEN
    CREATE ROLE incident_api NOLOGIN;
  END IF;
END `$`$;
GRANT USAGE ON SCHEMA public TO incident_api;
GRANT SELECT, INSERT, UPDATE ON incident_dossiers, historical_incident_memory TO incident_api;
"@
& docker exec -i $DatabaseContainerName psql --username $databaseUser --dbname $databaseName --command $grantSql | Out-Null

$databaseUri = "postgresql://$databaseUser`:$databasePassword@host.docker.internal:$($connectionUri.Port)/$databaseName"
& docker run --detach `
  --name $BridgeContainerName `
  --publish "127.0.0.1:$HostPort`:3000" `
  --env "PGRST_DB_URI=$databaseUri" `
  --env "PGRST_DB_ANON_ROLE=incident_api" `
  --env "PGRST_DB_SCHEMA=public" `
  $Image | Out-Null

for ($attempt = 1; $attempt -le 20; $attempt++) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$HostPort/" -TimeoutSec 2 | Out-Null
    Write-Host "PostgreSQL REST bridge is running at http://127.0.0.1:$HostPort."
    exit 0
  } catch {
    Start-Sleep -Seconds 1
  }
}
throw "PostgreSQL REST bridge did not become ready. Check docker logs $BridgeContainerName."
