param(
  [string]$BaseUrl = "http://localhost:8001",
  [string]$AdminUser = "admin",
  [string]$AdminPass = "admin123",
  [int]$TimeoutMinutes = 12
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

function Invoke-Json {
  param([string]$Method,[string]$Url,[object]$Body=$null,[string]$Token="")
  $client = New-Object System.Net.Http.HttpClient
  try {
    $req = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::$Method), $Url
    if ($Token) { [void]$req.Headers.TryAddWithoutValidation("Authorization", "Bearer $Token") }
    if ($null -ne $Body) {
      $payload = $Body | ConvertTo-Json -Depth 8
      $req.Content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")
    }
    $resp = $client.SendAsync($req).GetAwaiter().GetResult()
    $raw = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $json = $null
    if ($raw) { try { $json = $raw | ConvertFrom-Json } catch {} }
    return [pscustomobject]@{ status=[int]$resp.StatusCode; json=$json; raw=$raw }
  } finally { $client.Dispose() }
}

Write-Host "[INFO] Login admin..."
$login = Invoke-Json -Method POST -Url "$BaseUrl/api/auth/login" -Body @{username=$AdminUser;password=$AdminPass}
if ($login.status -ne 200 -or -not $login.json.access_token) { throw "Admin login failed" }
$token = $login.json.access_token

$watchName = "Scheduler test auto"
$watchQuery = "qdrant release changelog"

Write-Host "[INFO] Ensure personal watch exists with cron */10 ..."
$wl = Invoke-Json -Method GET -Url "$BaseUrl/api/watchlist" -Token $token
if ($wl.status -ne 200) { throw "Cannot read watchlist" }
$watch = $null
foreach ($w in $wl.json) {
  if ($w.name -eq $watchName -and $w.scope -eq "personal") { $watch = $w; break }
}
if (-not $watch) {
  $create = Invoke-Json -Method POST -Url "$BaseUrl/api/watchlist/personal" -Token $token -Body @{
    name=$watchName; query=$watchQuery; cron="*/10 * * * *"; enabled=$true; recency_days=7; max_results=3; domains_allow=@("github.com"); domains_block=@()
  }
  if ($create.status -ne 200) { throw "Cannot create test watch" }
  $watch = $create.json
} elseif ($watch.cron -ne "*/10 * * * *" -or -not $watch.enabled) {
  $upd = Invoke-Json -Method PUT -Url "$BaseUrl/api/watchlist/personal/$($watch.id)" -Token $token -Body @{
    name=$watch.name; query=$watch.query; cron="*/10 * * * *"; enabled=$true; recency_days=$watch.recency_days; max_results=$watch.max_results; domains_allow=$watch.domains_allow; domains_block=$watch.domains_block
  }
  if ($upd.status -ne 200) { throw "Cannot update test watch" }
  $watch = $upd.json
}

$watchId = $watch.id
Write-Host "[INFO] watch_id=$watchId"

$runsBefore = Invoke-Json -Method GET -Url "$BaseUrl/api/runs" -Token $token
if ($runsBefore.status -ne 200) { throw "Cannot list runs" }
$maxBefore = 0
foreach ($r in $runsBefore.json) { if ($r.watch_id -eq $watchId -and $r.id -gt $maxBefore) { $maxBefore = $r.id } }
Write-Host "[INFO] max run id before = $maxBefore"

$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
Write-Host "[INFO] Waiting for scheduler run (timeout ${TimeoutMinutes}m)..."

$found = $false
$newRun = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 20
  $runs = Invoke-Json -Method GET -Url "$BaseUrl/api/runs" -Token $token
  if ($runs.status -ne 200) { continue }
  foreach ($r in $runs.json) {
    if ($r.watch_id -eq $watchId -and $r.id -gt $maxBefore) {
      $found = $true
      $newRun = $r
      break
    }
  }
  if ($found) { break }
}

if (-not $found) {
  Write-Host "[FAIL] No new scheduled run found for watch_id=$watchId within ${TimeoutMinutes} minutes"
  exit 1
}

Write-Host "[PASS] Scheduled run detected: run_id=$($newRun.id), watch_id=$watchId, created_at=$($newRun.created_at)"
exit 0
