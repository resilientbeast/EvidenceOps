[CmdletBinding()]
param(
  [string]$DataHubOssVersion = "v1.6.0",
  [string]$DataHubCliVersion = "1.7.0"
)

$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $PSCommandPath
$generatedDirectory = Join-Path $scriptDirectory ".generated"
$composePath = Join-Path $generatedDirectory "docker-compose.quickstart.auth.yml"
$sourceUrl = "https://raw.githubusercontent.com/datahub-project/datahub/$DataHubOssVersion/docker/quickstart/docker-compose.quickstart-profile.yml"

New-Item -ItemType Directory -Path $generatedDirectory -Force | Out-Null
Invoke-WebRequest -Uri $sourceUrl -OutFile $composePath

$compose = Get-Content -LiteralPath $composePath -Raw
$gmsSetting = "METADATA_SERVICE_AUTH_ENABLED: 'false'"
if ([regex]::Matches($compose, [regex]::Escape($gmsSetting)).Count -ne 1) {
  throw "Expected one GMS metadata-service authentication setting in $sourceUrl. Refusing to patch an unexpected compose profile."
}

$compose = $compose.Replace($gmsSetting, "METADATA_SERVICE_AUTH_ENABLED: 'true'")

$frontendEnvironment = @"
      DATAHUB_GMS_HOST: datahub-gms
      DATAHUB_GMS_PORT: '8080'
      DATAHUB_PLAY_MEM_BUFFER_SIZE: 10MB
"@
$frontendWithAuth = @"
      DATAHUB_GMS_HOST: datahub-gms
      DATAHUB_GMS_PORT: '8080'
      METADATA_SERVICE_AUTH_ENABLED: 'true'
      DATAHUB_PLAY_MEM_BUFFER_SIZE: 10MB
"@

if (-not $compose.Contains($frontendEnvironment)) {
  throw "Expected frontend environment block in $sourceUrl. Refusing to generate a partially authenticated stack."
}

Set-Content -LiteralPath $composePath -Value $compose.Replace($frontendEnvironment, $frontendWithAuth) -NoNewline

Write-Host "Starting DataHub $DataHubOssVersion with metadata-service authentication enabled."
Write-Host "Generated compose profile: $composePath"
& uvx --from "acryl-datahub==$DataHubCliVersion" datahub docker quickstart --version $DataHubOssVersion --quickstart-compose-file $composePath --accept-version-default
