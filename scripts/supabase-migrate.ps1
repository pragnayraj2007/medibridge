# Runs a SQL migration on the Supabase project through the Supabase Management API.
# Needs SUPABASE_ACCESS_TOKEN (a personal access token, sbp_...) in apps\backend\local-secrets.txt.
# The token is read from that file and never printed.
param(
  [string]$Sql = "$PSScriptRoot\..\apps\backend\supabase\migrations\002_patients_appointments.sql",
  [string]$Secrets = "$PSScriptRoot\..\apps\backend\local-secrets.txt"
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Secret($name) {
  $line = Get-Content $Secrets | Where-Object { $_ -like "$name=*" } | Select-Object -First 1
  if (-not $line) { return $null }
  ($line -split '=', 2)[1].Trim()
}
$token = Secret 'SUPABASE_ACCESS_TOKEN'
$url = Secret 'SUPABASE_URL'
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN missing from local-secrets.txt' }
if ($url -notmatch 'https://([a-z0-9]+)\.supabase\.co') { throw 'SUPABASE_URL missing or unexpected' }
$ref = $Matches[1]
$body = @{ query = [IO.File]::ReadAllText((Resolve-Path $Sql)) } | ConvertTo-Json -Depth 3
$headers = @{ Authorization = "Bearer $token" }
Write-Host "Applying $(Split-Path $Sql -Leaf) to project $ref ..."
$null = Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/database/query" -Headers $headers `
  -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
$check = @{ query = "select (select count(*) from public.doctors) as doctors, to_regclass('public.appointments') is not null as appointments, to_regclass('public.patients') is not null as patients, to_regclass('public.documents') is not null as documents" } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/database/query" -Headers $headers `
  -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($check)) -TimeoutSec 60
Write-Host "MIGRATION OK: $($r | ConvertTo-Json -Compress)"
