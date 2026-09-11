# Removes the rows created by the test scripts (SMOKE TEST, INTEGRATION TEST, ...) from
# Supabase, so the doctor dashboard only shows real demo cases. Prints what is left.
param(
  [string]$Secrets = "$PSScriptRoot\..\apps\backend\local-secrets.txt",
  [string[]]$TestNames = @('SMOKE TEST', 'INTEGRATION TEST', 'AGENT TEST', 'UPLOAD JSON TEST', 'API TEST', 'TEST', 'TEST - DELETE ME'),
  [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Secret($key) {
  $line = Get-Content -Encoding UTF8 $Secrets | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
  if (-not $line) { throw "$key not found in $Secrets" }
  ($line -replace "^\s*$key\s*=\s*", '').Trim().Trim('"')
}
$base = (Secret 'SUPABASE_URL').TrimEnd('/')
$H = @{ apikey = (Secret 'SUPABASE_SERVICE_KEY'); Authorization = "Bearer $(Secret 'SUPABASE_SERVICE_KEY')" }

# Supabase refuses a service key sent with a browser user agent, so use our own
$UA = 'medibridge-cleanup/1.0'
function Get-Rows($path) { Invoke-RestMethod -Method Get -Uri "$base/rest/v1/$path" -Headers $H -UserAgent $UA }
function Remove-Rows($path) {
  if ($WhatIf) { Write-Host "   would delete $path"; return }
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/$path" -Headers $H -UserAgent $UA | Out-Null
}
function IsTest($name) { $name -and ($TestNames -contains $name.Trim().ToUpper()) }

Write-Host "MediBridge demo cleanup  $(Get-Date -Format s)"
$patients = Get-Rows 'patients?select=id,patient_code,name,created_at'
$cases = Get-Rows 'cases?select=id,patient_id,patient,triage_level,created_at'

$testPatients = @($patients | Where-Object { IsTest $_.name })
$testCaseIds = @($cases | Where-Object { $_.patient_id -and ($testPatients.id -contains $_.patient_id) } | ForEach-Object { $_.id })
$namedTestCases = @($cases | Where-Object { $_.patient_id -and (IsTest $_.patient.name) -and -not ($testPatients.id -contains $_.patient_id) })
# Cases with no patient ID: from before patient accounts existed, or named like a test
$orphanCases = @($cases | Where-Object { -not $_.patient_id -and ((IsTest $_.patient.name) -or [string]::IsNullOrWhiteSpace($_.patient.name)) })

Write-Host "test patients: $($testPatients.Count)   their cases: $($testCaseIds.Count)   test cases without a patient ID: $($orphanCases.Count)"

foreach ($p in $testPatients) {
  Write-Host " - $($p.patient_code) $($p.name)"
  Remove-Rows "appointments?patient_id=eq.$($p.id)"
  Remove-Rows "documents?patient_id=eq.$($p.id)"
  Remove-Rows "cases?patient_id=eq.$($p.id)"
  Remove-Rows "patients?id=eq.$($p.id)"
}
foreach ($c in ($orphanCases + $namedTestCases)) {
  Write-Host " - case $($c.id) ($($c.patient.name))"
  Remove-Rows "appointments?case_id=eq.$($c.id)"
  Remove-Rows "cases?id=eq.$($c.id)"
}

$left = Get-Rows 'patients?select=patient_code,name,created_at&order=created_at.desc'
$leftCases = Get-Rows 'cases?select=id,triage_level,patient,created_at&order=created_at.desc'
Write-Host ""
Write-Host "REMAINING patients ($($left.Count)):"
$left | ForEach-Object { Write-Host ("  {0}  {1}  {2}" -f $_.patient_code, $_.name, $_.created_at) }
Write-Host "REMAINING cases ($($leftCases.Count)):"
$leftCases | ForEach-Object { Write-Host ("  CASE-{0}  {1}  {2}  {3}" -f $_.id.Substring(0, 8).ToUpper(), $_.triage_level, $_.patient.name, $_.created_at) }
