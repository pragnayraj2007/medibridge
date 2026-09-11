# MediBridge end-to-end smoke test (Windows PowerShell 5+).
# Talks to the backend exactly like the Android app does (direct HTTPS, no browser),
# then reads and updates the same case through the doctor site's /api proxy.
# Creates one test case named "SMOKE TEST" and marks it reviewed.
param(
  [string]$Backend = 'https://medibridge-api-rose.vercel.app',
  [string]$Site = 'https://medibridge-xi.vercel.app',
  [string]$Out = "$PSScriptRoot\..\_to_delete\smoke-test-report.txt"
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$lines = New-Object System.Collections.Generic.List[string]
$fail = 0
function Log($s) { $script:lines.Add($s); Write-Host $s }
function Check($name, [scriptblock]$body) {
  $t = [Diagnostics.Stopwatch]::StartNew()
  try { $r = & $body; Log ("PASS  {0}  ({1} ms)  {2}" -f $name, $t.ElapsedMilliseconds, $r) }
  catch { $script:fail++; Log ("FAIL  {0}  ({1} ms)  {2}" -f $name, $t.ElapsedMilliseconds, $_.Exception.Message) }
}
function Post($url, $obj) { Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body ($obj | ConvertTo-Json -Depth 10) -TimeoutSec 60 }

Log "MediBridge smoke test  $(Get-Date -Format s)"
Log "Backend: $Backend"
Log "Site:    $Site"

Check 'backend /health (supabase + groq)' {
  $h = Invoke-RestMethod "$Backend/health" -TimeoutSec 30
  if ($h.status -ne 'ok' -or $h.storage -ne 'supabase') { throw "unexpected: $($h | ConvertTo-Json -Compress)" }
  "storage=$($h.storage) ai=$($h.ai)"
}
Check 'phone path: POST /intake/next-question' {
  $q = Post "$Backend/intake/next-question" @{ patient = @{ age = 45; sex = 'male' }; language = 'en'; messages = @() }
  if (-not $q.question) { throw 'no question' }
  "source=$($q.source) q=""$($q.question)"""
}
$script:caseId = $null
Check 'phone path: POST /cases (chest pain, 62M -> RED)' {
  $c = Post "$Backend/cases" @{
    patient = @{ name = 'SMOKE TEST'; age = 62; sex = 'male' }; language = 'en'
    messages = @(@{ role = 'assistant'; text = 'What brings you in today?' }, @{ role = 'patient'; text = 'Chest pain since this morning' })
  }
  $script:caseId = $c.id
  if ($c.triage_level -ne 'RED') { throw "expected RED, got $($c.triage_level)" }
  "id=$($c.id) level=$($c.triage_level) extraction=$($c.extraction.source)"
}
Check 'doctor path: GET /api/cases (list via site proxy)' {
  $all = Invoke-RestMethod "$Site/api/cases" -TimeoutSec 30
  if (-not ($all | Where-Object { $_.id -eq $script:caseId })) { throw 'new case not in list' }
  "cases=$(@($all).Count), new case listed"
}
Check 'doctor path: GET /api/cases/{id}' {
  $one = Invoke-RestMethod "$Site/api/cases/$script:caseId" -TimeoutSec 30
  "reasons=$(@($one.triage.reasons).Count) summary=$([bool]$one.summary)"
}
Check 'doctor path: PATCH status -> reviewed' {
  $u = Invoke-RestMethod -Method Patch -Uri "$Site/api/cases/$script:caseId" -ContentType 'application/json' -Body '{"status":"reviewed"}' -TimeoutSec 30
  if ($u.status -ne 'reviewed') { throw "status=$($u.status)" }
  'status=reviewed'
}
foreach ($p in '/', '/doctor', '/patient') {
  Check "site page $p" { $r = Invoke-WebRequest "$Site$p" -UseBasicParsing -TimeoutSec 30; "HTTP $($r.StatusCode)" }
}
Log ("RESULT: {0}" -f $(if ($fail) { "$fail FAILED" } else { 'ALL PASSED' }))
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$lines | Set-Content -Encoding UTF8 $Out
exit $fail
