# Live check of the intake questions: runs a few scripted patients against the deployed backend
# and prints every question with its response time. Report: _to_delete\intake-eval.txt
param(
  [string]$Backend = 'https://medibridge-api-rose.vercel.app',
  [string]$Out = "$PSScriptRoot\..\_to_delete\intake-eval.txt"
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$lines = New-Object System.Collections.Generic.List[string]
function Log($s) { $script:lines.Add($s); Write-Host $s }
function Call($method, $url, $obj, $headers) {
  $req = @{ Method = $method; Uri = $url; TimeoutSec = 90; Headers = $headers }
  if ($obj -ne $null) { $req.ContentType = 'application/json; charset=utf-8'; $req.Body = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 10)) }
  Invoke-RestMethod @req
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

Log "MediBridge intake check  $(Get-Date -Format s)"
Interview 'Chest pain, 62M (serious: expect 4 questions)' @{ age = 62; sex = 'male' } 'en' @(
  'I have a heavy pain in my chest since this morning', 'It started at 7 am, maybe 8 out of 10', 'I am sweating and a bit breathless', 'I have high blood pressure, I take amlodipine') @{}
Interview 'Cough, 30F (basic: expect 6 questions)' @{ age = 30; sex = 'female' } 'en' @(
  'I have a cough', 'Since 4 days, a little better today', 'Maybe 3 out of 10', 'A mild sore throat', 'No', 'No medicines, no allergies') @{}
Interview 'Hindi, fever (basic: expect 6 questions)' @{ age = 28; sex = 'female' } 'hi' @(
  'Mujhe teen din se bukhar hai', 'Teen din pehle shuru hua, waisa hi hai', '6 out of 10', 'Sar mein dard bhi hai', 'Nahi', 'Koi dawai nahi, koi allergy nahi') @{}
Interview 'Telugu, stomach pain (basic: expect 6 questions)' @{ age = 40; sex = 'male' } 'te' @(
  'Naaku kadupu noppi undi', 'Ninna nundi', '5', 'Vanthulu levu', 'Sugar undi', 'Metformin vaadutunnanu') @{}

New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$lines | Set-Content -Encoding UTF8 $Out
