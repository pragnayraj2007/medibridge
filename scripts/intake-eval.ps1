# Live check of the intake agent: runs a few scripted patients against the deployed backend
# and prints every question with its response time. Report: _to_delete\intake-eval.txt
param(
  [string]$Backend = 'https://medibridge-api-rose.vercel.app',
  [string]$Document = "$PSScriptRoot\samples\sample-lab-report.png",
  [string]$Out = "$PSScriptRoot\..\_to_delete\intake-eval.txt"
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$lines = New-Object System.Collections.Generic.List[string]
function Log($s) { $script:lines.Add($s); Write-Host $s }
function Call($method, $url, $obj, $headers) {
  $req = @{ Method = $method; Uri = $url; TimeoutSec = 90; Headers = $headers }
  if ($obj -ne $null) { $req.ContentType = 'application/json; charset=utf-8'; $req.Body = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 10)) }
  Invoke-RestMethod @req
}
function Upload($url, [byte[]]$bytes, $fileName, $mime, $headers) {
  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromSeconds(90)
  foreach ($k in $headers.Keys) { $client.DefaultRequestHeaders.Add($k, $headers[$k]) }
  $form = New-Object System.Net.Http.MultipartFormDataContent
  $file = New-Object System.Net.Http.ByteArrayContent(, $bytes)
  $file.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($mime)
  $form.Add($file, 'file', $fileName)
  $form.Add((New-Object System.Net.Http.StringContent('Lab Report')), 'doc_type')
  $client.PostAsync($url, $form).Result.Content.ReadAsStringAsync().Result | ConvertFrom-Json
}
function Interview($title, $patient, $language, $answers, $headers) {
  Log ""
  Log "=== $title"
  $msgs = @()
  $times = @()
  foreach ($i in 0..6) {
    $t = [Diagnostics.Stopwatch]::StartNew()
    $r = Call Post "$Backend/intake/next-question" @{ patient = $patient; language = $language; messages = $msgs } $headers
    $ms = $t.ElapsedMilliseconds; $times += $ms
    Log ("  Q{0} ({1} ms, {2}{3}): {4}" -f ($i + 1), $ms, $r.source, $(if ($r.safety.urgent) { ', URGENT' } else { '' }), $r.question)
    if ($r.done) { break }
    $msgs += @{ role = 'assistant'; text = $r.question }
    $a = if ($i -lt $answers.Count) { $answers[$i] } else { "No, nothing else." }
    Log "     A: $a"
    $msgs += @{ role = 'patient'; text = $a }
  }
  $asked = @($msgs | Where-Object { $_.role -eq 'assistant' }).Count
  Log ("  -> {0} questions, average {1} ms per reply" -f $asked, [int](($times | Measure-Object -Average).Average))
}

Log "MediBridge intake agent check  $(Get-Date -Format s)"
Interview 'Chest pain, 62M (urgent: expect 2 questions max, warning-sign follow-up)' @{ age = 62; sex = 'male' } 'en' @(
  'I have a heavy pain in my chest since this morning', 'It goes to my left arm and I am sweating') @{}
Interview 'Vague patient (expect simpler rephrasing)' @{ age = 35; sex = 'female' } 'en' @(
  'I just dont feel good', 'I dont know, everything', 'Since 2 days, maybe 5 out of 10', 'No medicines') @{}
Interview 'Hindi, fever' @{ age = 28; sex = 'female' } 'hi' @(
  'Mujhe teen din se bukhar hai', 'Sar mein dard bhi hai, 6 out of 10', 'Nahi, koi dawai nahi') @{}

# Returning patient with a report on file: the agent should use the records (e.g. metformin)
$reg = Call Post "$Backend/patients" @{ name = 'AGENT TEST'; age = 48; sex = 'male'; pregnancy_status = 'unknown'; language = 'en' }
$P = @{ 'X-Patient-Code' = $reg.patient.patient_code; 'X-Patient-Token' = $reg.token }
$null = Upload "$Backend/documents" ([IO.File]::ReadAllBytes($Document)) 'sample-lab-report.png' 'image/png' $P
Interview 'Returning patient with lab report on file (expect it to use the records)' @{ age = 48; sex = 'male' } 'en' @(
  'My sugar has been very high and I feel tired all the time', 'For about two weeks, maybe 4 out of 10', 'Yes still taking it') $P

New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$lines | Set-Content -Encoding UTF8 $Out
