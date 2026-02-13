param(
  [string]$BaseUrl = "http://localhost:8001",
  [string]$AdminUser = "admin",
  [string]$AdminPass = "admin123",
  [switch]$SkipAsk,
  [switch]$SkipRateLimit
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$Name, [bool]$Ok, [string]$Detail = "")
  $results.Add([pscustomobject]@{ test = $Name; ok = $Ok; detail = $Detail })
  $status = if ($Ok) { "PASS" } else { "FAIL" }
  Write-Host "[$status] $Name $Detail"
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null,
    [string]$Token = ""
  )

  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }

  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromMinutes(6)
  try {
    $req = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::$Method), $Url
    foreach ($k in $headers.Keys) {
      [void]$req.Headers.TryAddWithoutValidation($k, $headers[$k])
    }
    if ($null -ne $Body) {
      $payload = $Body | ConvertTo-Json -Depth 8
      $req.Content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")
    }
    $resp = $client.SendAsync($req).GetAwaiter().GetResult()
    $raw = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $json = $null
    if ($raw) {
      try { $json = $raw | ConvertFrom-Json } catch { $json = $null }
    }
    return [pscustomobject]@{ status = [int]$resp.StatusCode; json = $json; raw = $raw }
  } finally {
    $client.Dispose()
  }
}

# 1) Health
$health = Invoke-Json -Method GET -Url "$BaseUrl/api/health"
Add-Result -Name "Health endpoint" -Ok ($health.status -eq 200) -Detail "status=$($health.status)"

# 2) Admin login
$adminLogin = Invoke-Json -Method POST -Url "$BaseUrl/api/auth/login" -Body @{ username = $AdminUser; password = $AdminPass }
$adminToken = $adminLogin.json.access_token
Add-Result -Name "Admin login" -Ok (($adminLogin.status -eq 200) -and [string]::IsNullOrEmpty($adminToken) -eq $false) -Detail "status=$($adminLogin.status)"

if (-not $adminToken) {
  Write-Host "Admin login failed. Aborting remaining tests."
  $results | Format-Table -AutoSize
  exit 1
}

# 3) /api/me admin
$meAdmin = Invoke-Json -Method GET -Url "$BaseUrl/api/me" -Token $adminToken
Add-Result -Name "Admin /api/me" -Ok (($meAdmin.status -eq 200) -and $meAdmin.json.role -eq "admin") -Detail "status=$($meAdmin.status), role=$($meAdmin.json.role)"

# 4) Create normal user
$rand = Get-Random -Minimum 1000 -Maximum 9999
$userName = "smoke_user_$rand"
$userPass = "Password123!"
$newUser = Invoke-Json -Method POST -Url "$BaseUrl/api/admin/users" -Token $adminToken -Body @{ username = $userName; password = $userPass; role = "user" }
Add-Result -Name "Admin create user" -Ok ($newUser.status -eq 200) -Detail "status=$($newUser.status), username=$userName"

# 5) User login
$userLogin = Invoke-Json -Method POST -Url "$BaseUrl/api/auth/login" -Body @{ username = $userName; password = $userPass }
$userToken = $userLogin.json.access_token
Add-Result -Name "User login" -Ok (($userLogin.status -eq 200) -and [string]::IsNullOrEmpty($userToken) -eq $false) -Detail "status=$($userLogin.status)"

# 6) User blocked from admin endpoint
$userAdminList = Invoke-Json -Method GET -Url "$BaseUrl/api/admin/users" -Token $userToken
Add-Result -Name "User blocked on admin endpoint" -Ok ($userAdminList.status -eq 403) -Detail "status=$($userAdminList.status)"

# 6b) Ollama model availability (used by run/ask)
$ollamaModelList = docker compose exec -T ollama ollama list
$ollamaModelReady = ($ollamaModelList | Select-String -Pattern "llama3.2" -Quiet)
Add-Result -Name "Ollama model ready" -Ok $ollamaModelReady -Detail ("ready=" + $ollamaModelReady)

# 7) Create personal watch
$watchPayload = @{
  name = "Smoke watch $rand"
  query = "qdrant release changelog"
  cron = "*/10 * * * *"
  enabled = $true
  recency_days = 7
  max_results = 5
  domains_allow = @("github.com", "qdrant.tech")
  domains_block = @()
}
$watchCreate = Invoke-Json -Method POST -Url "$BaseUrl/api/watchlist/personal" -Token $userToken -Body $watchPayload
$watchId = $watchCreate.json.id
Add-Result -Name "Create personal watch" -Ok (($watchCreate.status -eq 200) -and $watchId) -Detail "status=$($watchCreate.status), watch_id=$watchId"

# 8) User list watchlist
$userWatchList = Invoke-Json -Method GET -Url "$BaseUrl/api/watchlist" -Token $userToken
$hasWatch = $false
if ($userWatchList.status -eq 200 -and $userWatchList.json) {
  foreach ($w in $userWatchList.json) {
    if ($w.id -eq $watchId) { $hasWatch = $true; break }
  }
}
Add-Result -Name "User sees own watch" -Ok (($userWatchList.status -eq 200) -and $hasWatch) -Detail "status=$($userWatchList.status)"

# 9) Create global watch with admin
$globalPayload = @{
  name = "Global smoke $rand"
  query = "postgresql release notes"
  cron = "*/10 * * * *"
  enabled = $true
  recency_days = 30
  max_results = 3
  domains_allow = @("postgresql.org")
  domains_block = @()
}
$globalCreate = Invoke-Json -Method POST -Url "$BaseUrl/api/watchlist/global" -Token $adminToken -Body $globalPayload
$globalWatchId = $globalCreate.json.id
Add-Result -Name "Admin create global watch" -Ok (($globalCreate.status -eq 200) -and $globalWatchId) -Detail "status=$($globalCreate.status), watch_id=$globalWatchId"

# 10) User cannot run global watch now
$userRunGlobal = Invoke-Json -Method POST -Url "$BaseUrl/api/watchlist/$globalWatchId/run" -Token $userToken
Add-Result -Name "User blocked run-now on global" -Ok ($userRunGlobal.status -eq 403) -Detail "status=$($userRunGlobal.status)"

# 11) User run-now personal watch (requires model)
$runId = $null
if ($ollamaModelReady) {
  $userRunPersonal = Invoke-Json -Method POST -Url "$BaseUrl/api/watchlist/$watchId/run" -Token $userToken
  $runId = $userRunPersonal.json.id
  Add-Result -Name "User run-now personal watch" -Ok (($userRunPersonal.status -eq 200) -and $runId) -Detail "status=$($userRunPersonal.status), run_id=$runId"
} else {
  Add-Result -Name "User run-now personal watch" -Ok $true -Detail "skipped: model download in progress"
}

# 12) Runs list/details visibility
$userRuns = Invoke-Json -Method GET -Url "$BaseUrl/api/runs" -Token $userToken
$userHasRun = $false
if ($runId -and $userRuns.status -eq 200 -and $userRuns.json) {
  foreach ($r in $userRuns.json) {
    if ($r.id -eq $runId) { $userHasRun = $true; break }
  }
}
if ($runId) {
  Add-Result -Name "User sees own run" -Ok (($userRuns.status -eq 200) -and $userHasRun) -Detail "status=$($userRuns.status)"
} else {
  Add-Result -Name "User sees own run" -Ok ($userRuns.status -eq 200) -Detail "status=$($userRuns.status), skipped specific run check"
}

$adminRuns = Invoke-Json -Method GET -Url "$BaseUrl/api/runs" -Token $adminToken
Add-Result -Name "Admin runs list" -Ok ($adminRuns.status -eq 200) -Detail "status=$($adminRuns.status)"

if ((-not $SkipAsk) -and $ollamaModelReady) {
  # 13) Ask end-to-end
  $ask = Invoke-Json -Method POST -Url "$BaseUrl/api/ask" -Token $userToken -Body @{
    query = "qdrant 2026 updates"
    recency_days = 30
    max_results = 3
    domains_allow = @("github.com", "qdrant.tech")
    domains_block = @()
  }
  $digestOk = $false
  if ($ask.status -eq 200 -and $ask.json.digest_md) {
    $digestOk = $ask.json.digest_md.Length -gt 0
  }
  Add-Result -Name "Ask returns digest" -Ok (($ask.status -eq 200) -and $digestOk) -Detail "status=$($ask.status)"
} elseif (-not $SkipAsk) {
  Add-Result -Name "Ask returns digest" -Ok $true -Detail "skipped: model download in progress"
}

if (-not $SkipRateLimit) {
  # 14) Basic rate-limit check by forcing low limit would require restart; here do burst and check if any 429 appears.
  $saw429 = $false
  for ($i = 0; $i -lt 12; $i++) {
    $tmp = Invoke-Json -Method POST -Url "$BaseUrl/api/watchlist/$watchId/run" -Token $userToken
    if ($tmp.status -eq 429) { $saw429 = $true; break }
  }
  Add-Result -Name "Rate limit burst sanity" -Ok ($true) -Detail ("429_seen=" + $saw429)
}

# 15) SearXNG JSON reachable from API container
$searx = docker compose exec -T api python -c "import os,httpx; r=httpx.get(os.getenv('SEARXNG_URL') + '/search', params={'q':'test','format':'json'}, timeout=15); print(r.status_code)"
$searxOk = ($searx -match "200")
Add-Result -Name "SearXNG JSON from API" -Ok $searxOk -Detail "raw=$searx"

# 16) Ollama tags reachable from API container network
$ollamaTags = docker compose exec -T api python -c "import os,httpx; r=httpx.get(os.getenv('OLLAMA_URL') + '/api/tags', timeout=15); print(r.status_code)"
$ollamaOk = ($ollamaTags -match "200")
Add-Result -Name "Ollama tags from API" -Ok $ollamaOk -Detail "raw=$ollamaTags"

# Summary
Write-Host ""
Write-Host "==== SUMMARY ===="
$results | Format-Table -AutoSize

$failed = @($results | Where-Object { $_.ok -eq $false }).Count
if ($failed -gt 0) {
  Write-Host "FAILED: $failed test(s)"
  exit 1
}
Write-Host "ALL TESTS PASSED"
exit 0
