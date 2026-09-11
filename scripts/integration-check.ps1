# Live check of the external services behind the backend (Windows PowerShell 5+):
# Sarvam TTS -> Sarvam STT round trip, document upload -> OCR/Gemini, and data fusion
# into a case (profile + voice + document + previous case). Cancels its appointments after.
param(
  [string]$Backend = 'https://medibridge-api-rose.vercel.app',
  [string]$Site = 'https://medibridge-xi.vercel.app',
  [string]$Document = "$PSScriptRoot\samples\sample-lab-report.png",
  [string]$DoctorPassword = $env:MEDIBRIDGE_DEMO_PASSWORD,
  [string]$Out = "$PSScriptRoot\..\_to_delete\integration-report.txt"
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$lines = New-Object System.Collections.Generic.List[string]
$fail = 0
function Log($s) { $script:lines.Add($s); Write-Host $s }
function Check($name, [scriptblock]$body) {
  $t = [Diagnostics.Stopwatch]::StartNew()
  try { $r = & $body; Log ("PASS  {0}  ({1} ms)  {2}" -f $name, $t.ElapsedMilliseconds, $r) }
  catch { $script:fail++; Log ("FAIL  {0}  ({1} ms)  {2} {3}" -f $name, $t.ElapsedMilliseconds, $_.Exception.Message, $_.ErrorDetails.Message) }
}
function Call($method, $url, $obj, $headers) {
  $req = @{ Method = $method; Uri = $url; TimeoutSec = 90; Headers = $headers }
  if ($obj -ne $null) { $req.ContentType = 'application/json'; $req.Body = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 10)) }
  Invoke-RestMethod @req
}
function Upload($url, [byte[]]$bytes, $fileName, $mime, $fields, $headers) {
  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromSeconds(90)
  foreach ($k in $headers.Keys) { $client.DefaultRequestHeaders.Add($k, $headers[$k]) }
  $form = New-Object System.Net.Http.MultipartFormDataContent
  $file = New-Object System.Net.Http.ByteArrayContent(, $bytes)
  $file.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($mime)
  $form.Add($file, 'file', $fileName)
  foreach ($k in $fields.Keys) { $form.Add((New-Object System.Net.Http.StringContent($fields[$k])), $k) }
  $resp = $client.PostAsync($url, $form).Result
  $text = $resp.Content.ReadAsStringAsync().Result
  if (-not $resp.IsSuccessStatusCode) { throw "HTTP $([int]$resp.StatusCode): $text" }
  $text | ConvertFrom-Json
}

Log "MediBridge integration check  $(Get-Date -Format s)"
$r = Call Post "$Backend/patients" @{ name = 'INTEGRATION TEST'; age = 62; sex = 'male'; language = 'en' }
$P = @{ 'X-Patient-Code' = $r.patient.patient_code; 'X-Patient-Token' = $r.token }
Log "patient $($r.patient.patient_code)"
$script:wav = $null; $script:transcript = $null; $script:doc = $null; $script:appts = @()

Check 'Sarvam TTS (bulbul) speaks a sentence' {
  $s = Call Post "$Backend/voice/speak" @{ text = 'I have had chest pain since this morning and I feel breathless.'; language = 'en' } $P
  $script:wav = [Convert]::FromBase64String($s.audio_base64)
  "mime=$($s.mime) bytes=$($script:wav.Length)"
}
Check 'Sarvam STT (saaras) transcribes it back' {
  if (-not $script:wav) { throw 'no audio from TTS' }
  $t = Upload "$Backend/voice/transcribe" $script:wav 'voice.wav' 'audio/wav' @{ language = 'en' } $P
  $script:transcript = $t.transcript
  "transcript=""$($t.transcript)"" lang=$($t.language_code)"
}
Check 'Hindi TTS' {
  $s = Call Post "$Backend/voice/speak" @{ text = 'आपको यह तकलीफ़ कब से है?'; language = 'hi' } $P
  "bytes=$([Convert]::FromBase64String($s.audio_base64).Length)"
}
Check 'Document upload -> OCR -> Gemini findings' {
  $d = Upload "$Backend/documents" ([IO.File]::ReadAllBytes($Document)) 'sample-lab-report.png' 'image/png' @{ doc_type = 'Lab Report' } $P
  $script:doc = $d
  "status=$($d.status) ocr=$($d.ocr_status) analysis=$($d.analysis_status) error=$($d.analysis_error) summary=""$($d.summary)"""
}
Check 'Unsupported file is rejected clearly' {
  try { $null = Upload "$Backend/documents" ([Text.Encoding]::ASCII.GetBytes('GIF89a....')) 'x.gif' 'image/gif' @{} $P; throw 'accepted a GIF' }
  catch { if ($_.Exception.Message -notmatch '415') { throw } }
  '415 Unsupported file'
}
Check 'Previous case for the same patient' {
  $c = Call Post "$Backend/cases" @{ language = 'en'; messages = @(@{ role = 'assistant'; text = 'What brings you in today?' }, @{ role = 'patient'; text = 'Chest pain for 1 day' }); document_ids = @() } $P
  $script:appts += $c.appointment.id
  "case=$($c.case_code) level=$($c.triage_level)"
}
Check 'Fused case: voice + document + previous case -> Safety Engine + appointment' {
  $text = if ($script:transcript) { $script:transcript } else { 'I have had chest pain since this morning and I feel breathless.' }
  $ids = @(); if ($script:doc) { $ids = @($script:doc.id) }
  $c = Call Post "$Backend/cases" @{ language = 'en'; messages = @(@{ role = 'assistant'; text = 'What brings you in today?' }, @{ role = 'patient'; text = $text; via = 'voice' }); document_ids = $ids } $P
  $script:appts += $c.appointment.id
  $f = $c.fused_context
  "level=$($c.triage_level) sources=$($f.sources -join '+') conflicts=$(@($f.conflicts).Count) [$((@($f.conflicts) | ForEach-Object { $_.field + ':' + $_.kind }) -join ', ')] doctor=$($c.appointment.doctor.name)"
}
Check 'Summary mentions document + conflict (Groq)' {
  $c = Call Get "$Backend/patients/$($P['X-Patient-Code'])/cases" $null $P
  if ($c[0].PSObject.Properties.Name -contains 'summary') { throw 'summary exposed to patient' }
  if (-not $DoctorPassword) { return 'skipped (no doctor password)' }
  $s = Call Post "$Site/api/auth/login" @{ email = 'ananya.rao@medibridge.demo'; password = $DoctorPassword }
  $script:D = @{ Authorization = "Bearer $($s.token)" }
  Log "  logged in as $($s.doctor.name)"
  $one = Call Get "$Site/api/cases/$($c[0].id)" $null $script:D
  "summary_source=$($one.extraction.summary_source) docs=$(@($one.document_details).Count) summary=""$($one.summary)"""
}
Check 'diagnostics (doctor only)' {
  if (-not $script:D) { return 'skipped' }
  (Call Get "$Site/api/diagnostics" $null $script:D) | ConvertTo-Json -Depth 5 -Compress
}
Check 'cleanup' {
  if ($script:D) {
    foreach ($id in $script:appts) { if ($id) { try { $null = Call Patch "$Site/api/appointments/$id" @{ status = 'cancelled' } $script:D } catch {} } }
    $null = Call Post "$Site/api/demo/reset" @{ cancel_upcoming = $false } $script:D
  }
  'done'
}
Log ("RESULT: {0}" -f $(if ($fail) { "$fail FAILED" } else { 'ALL PASSED' }))
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$lines | Set-Content -Encoding UTF8 $Out
exit $fail
