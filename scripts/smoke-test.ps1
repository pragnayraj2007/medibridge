# MediBridge end-to-end smoke test (Windows PowerShell 5+).
# Patient calls go straight to the backend (like the Android app); doctor calls go
# through the site's /api proxy (like the dashboard). Creates a "SMOKE TEST" patient,
# three cases (RED, availability change, GREEN), then cancels its own appointments and
# restores the demo doctor scenario so the live demo is left as it was.
param(
  [string]$Backend = 'https://medibridge-api-rose.vercel.app',
  [string]$Site = 'https://medibridge-xi.vercel.app',
  [string]$DoctorEmail = 'ananya.rao@medibridge.demo',
  [string]$DoctorPassword = $env:MEDIBRIDGE_DEMO_PASSWORD,
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
function Call($method, $url, $obj, $headers) {
  $req = @{ Method = $method; Uri = $url; TimeoutSec = 90; Headers = $headers }
  if ($obj -ne $null) { $req.ContentType = 'application/json'; $req.Body = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 10)) }
  Invoke-RestMethod @req
}
function Msgs($text) { @(@{ role = 'assistant'; text = 'What brings you in today?' }, @{ role = 'patient'; text = $text; via = 'text' }) }

Log "MediBridge smoke test  $(Get-Date -Format s)"
Log "Backend: $Backend"
Log "Site:    $Site"
$script:P = $null; $script:D = $null; $script:appts = @()

Check 'backend /health' {
  $h = Invoke-RestMethod "$Backend/health" -TimeoutSec 30
  if ($h.status -ne 'ok' -or $h.storage -ne 'supabase') { throw "unexpected: $($h | ConvertTo-Json -Compress)" }
  "storage=$($h.storage) ai=$($h.ai) voice=$($h.voice) ocr=$($h.documents.ocr) multimodal=$($h.documents.multimodal)"
}
Check 'patient: register -> persistent ID + QR' {
  $r = Call Post "$Backend/patients" @{ name = 'SMOKE TEST'; age = 62; sex = 'male'; language = 'en' }
  if ($r.patient.patient_code -notmatch '^PAT-[0-9A-F]{8}$') { throw "bad code $($r.patient.patient_code)" }
  $script:P = @{ 'X-Patient-Code' = $r.patient.patient_code; 'X-Patient-Token' = $r.token }
  $script:code = $r.patient.patient_code
  "code=$($r.patient.patient_code) qr=$([bool]$r.patient.qr)"
}
Check 'patient: profile needs the device token' {
  try { Invoke-RestMethod "$Backend/patients/$script:code" -TimeoutSec 30 | Out-Null; throw 'profile readable without token' }
  catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw } }
  $p = Call Get "$Backend/patients/$script:code" $null $script:P
  "401 without token; name=$($p.name) with token"
}
Check 'patient: next question (no quick replies)' {
  $q = Call Post "$Backend/intake/next-question" @{ patient = @{ age = 62; sex = 'male' }; language = 'en'; messages = @() }
  if (-not $q.question) { throw 'no question' }
  "source=$($q.source) q=""$($q.question)"""
}
Check 'doctor: login' {
  if (-not $DoctorPassword) { throw 'set MEDIBRIDGE_DEMO_PASSWORD or pass -DoctorPassword' }
  $s = Call Post "$Site/api/auth/login" @{ email = $DoctorEmail; password = $DoctorPassword }
  $script:D = @{ Authorization = "Bearer $($s.token)" }
  "doctor=$($s.doctor.name)"
}
Check 'doctor: cases need login' {
  try { Invoke-RestMethod "$Site/api/cases" -TimeoutSec 30 | Out-Null; throw 'cases readable without login' }
  catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw } }
  '401 without token'
}
Check 'demo: reset scenario (A busy, B +20 min, C +45 min)' {
  $r = Call Post "$Site/api/demo/reset" @{ cancel_upcoming = $false } $script:D
  ($r.doctors | ForEach-Object { "$($_.name)=$($_.availability_status)" }) -join ', '
}
Check 'RED case -> Safety Engine RED -> earliest doctor (B, not busy A)' {
  $c = Call Post "$Backend/cases" @{ patient = @{ age = 62; sex = 'male' }; language = 'en'; messages = (Msgs 'Crushing chest pain since this morning'); document_ids = @() } $script:P
  if ($c.triage_level -ne 'RED') { throw "expected RED, got $($c.triage_level)" }
  if (-not $c.appointment) { throw "no appointment: $($c.appointment_error)" }
  $script:caseId = $c.id; $script:appts += $c.appointment.id
  if ($c.appointment.doctor.name -ne 'Dr. Ananya Rao') { throw "assigned $($c.appointment.doctor.name)" }
  "case=$($c.case_code) doctor=$($c.appointment.doctor.name) at=$($c.appointment.scheduled_at) priority=$($c.appointment.priority) status=$($c.appointment.status)"
}
Check 'doctor: case listed with appointment + patient ID' {
  $all = Call Get "$Site/api/cases" $null $script:D
  $row = $all | Where-Object { $_.id -eq $script:caseId }
  if (-not $row) { throw 'new case not in list' }
  if ($row.patient_code -ne $script:code -or -not $row.appointment) { throw 'missing patient code / appointment' }
  "cases=$(@($all).Count) appointment=$($row.appointment.doctor.name)"
}
Check 'doctor: case detail (Safety Engine source, AI summary, fused context)' {
  $one = Call Get "$Site/api/cases/$script:caseId" $null $script:D
  if ($one.triage.decided_by -ne 'safety_engine') { throw 'decided_by missing' }
  "reasons=$(@($one.triage.reasons).Count) summary=$([bool]$one.summary) sources=$($one.fused_context.sources -join '+') candidates=$(@($one.appointment.assignment.candidates).Count)"
}
Check 'doctor: appointment lifecycle confirmed -> in_progress -> completed' {
  $a = Call Patch "$Site/api/appointments/$($script:appts[0])" @{ status = 'in_progress' } $script:D
  $a = Call Patch "$Site/api/appointments/$($script:appts[0])" @{ status = 'completed' } $script:D
  if ($a.status -ne 'completed') { throw "status=$($a.status)" }
  'completed'
}
Check 'doctor: case status -> reviewed' {
  $u = Call Patch "$Site/api/cases/$script:caseId" @{ status = 'reviewed' } $script:D
  if ($u.status -ne 'reviewed') { throw "status=$($u.status)" }
  'reviewed'
}
Check 'availability: A busy -> available, next RED case goes to A' {
  $null = Call Patch "$Site/api/doctors/d0c70000-0000-4000-8000-00000000000a/availability" @{ availability_status = 'available' } $script:D
  $c = Call Post "$Backend/cases" @{ patient = @{ age = 62; sex = 'male' }; language = 'en'; messages = (Msgs 'Chest pain again, it is worse'); document_ids = @() } $script:P
  $script:appts += $c.appointment.id
  if ($c.appointment.doctor.name -ne 'Dr. Arjun Mehta') { throw "assigned $($c.appointment.doctor.name)" }
  "doctor=$($c.appointment.doctor.name) at=$($c.appointment.scheduled_at) previous_cases=$(@($c.fused_context.previous_cases).Count) conflicts=$(@($c.fused_context.conflicts).Count)"
}
Check 'GREEN case -> routine priority 3 slot' {
  $c = Call Post "$Backend/cases" @{ patient = @{ age = 62; sex = 'male' }; language = 'en'; messages = (Msgs 'I need a repeat prescription for my cream, no other problems'); document_ids = @() } $script:P
  if ($c.triage_level -ne 'GREEN' -or $c.appointment.priority -ne 3) { throw "level=$($c.triage_level) priority=$($c.appointment.priority)" }
  $script:appts += $c.appointment.id
  "doctor=$($c.appointment.doctor.name) at=$($c.appointment.scheduled_at)"
}
Check 'patient: appointments + previous cases persisted' {
  $a = Call Get "$Backend/patients/$script:code/appointments" $null $script:P
  $c = Call Get "$Backend/patients/$script:code/cases" $null $script:P
  if (@($a).Count -lt 3 -or @($c).Count -lt 3) { throw "appointments=$(@($a).Count) cases=$(@($c).Count)" }
  if ($c[0].PSObject.Properties.Name -contains 'summary') { throw 'AI summary exposed to patient' }
  "appointments=$(@($a).Count) cases=$(@($c).Count)"
}
Check 'cleanup: cancel test appointments, restore demo scenario' {
  foreach ($id in $script:appts) { try { $null = Call Patch "$Site/api/appointments/$id" @{ status = 'cancelled' } $script:D } catch {} }
  $null = Call Post "$Site/api/demo/reset" @{ cancel_upcoming = $false } $script:D
  'done'
}
foreach ($p in '/', '/doctor', '/doctor/login', '/patient') {
  Check "site page $p" { $r = Invoke-WebRequest "$Site$p" -UseBasicParsing -TimeoutSec 30; "HTTP $($r.StatusCode)" }
}
Log ("RESULT: {0}" -f $(if ($fail) { "$fail FAILED" } else { 'ALL PASSED' }))
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$lines | Set-Content -Encoding UTF8 $Out
exit $fail
