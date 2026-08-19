[CmdletBinding()]
param(
    [int]$Runs = 3,
    [int]$TrafficRequests = 12,
    [string]$DemoUrl = "http://localhost:4100",
    [string]$PrometheusUrl = "http://localhost:9090"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$HealthyDelayMs = 20
$FaultDelayMs = 600
$MinimumFaultLatencySeconds = 0.4
$MinimumLatencyRatio = 5.0
$ScrapeSettleSeconds = 6

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot "infra/docker-compose.yml"
$FaultComposeFile = Join-Path $RepoRoot "infra/docker-compose.demo-fault.yml"

function Invoke-Compose {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$Fault
    )

    $composeArguments = @("compose", "-f", $ComposeFile)

    if ($Fault) {
        $composeArguments += @("-f", $FaultComposeFile)
    }

    $composeArguments += $Arguments

    & docker @composeArguments

    if ($LASTEXITCODE -ne 0) {
        throw "docker compose failed with exit code $LASTEXITCODE"
    }
}

function Wait-DemoReady {
    param([int]$ExpectedDelayMs)

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(60)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri "$DemoUrl/health" -TimeoutSec 2

            if (
                $health.status -eq "ok" -and
                [int]$health.delayMs -eq $ExpectedDelayMs
            ) {
                return
            }
        }
        catch {
            # Container recreation can briefly refuse connections.
        }

        Start-Sleep -Seconds 1
    }

    throw "Demo app did not become ready with DEMO_DELAY_MS=$ExpectedDelayMs"
}

function Invoke-PrometheusInstantQuery {
    param([Parameter(Mandatory = $true)][string]$Query)

    $encodedQuery = [System.Uri]::EscapeDataString($Query)
    $response = Invoke-RestMethod -Uri "$PrometheusUrl/api/v1/query?query=$encodedQuery" -TimeoutSec 5

    if ($response.status -ne "success") {
        throw "Prometheus instant query failed: $Query"
    }

    return @($response.data.result)
}

function Wait-PrometheusDemoTarget {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(60)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            $result = @(Invoke-PrometheusInstantQuery -Query 'up{job="demo-app"}')

            if (
                $result.Count -eq 1 -and
                [double]$result[0].value[1] -eq 1
            ) {
                return
            }
        }
        catch {
            # Prometheus can be restarting or waiting for the first scrape.
        }

        Start-Sleep -Seconds 1
    }

    throw 'Prometheus target up{job="demo-app"} did not reach 1'
}

function Get-PrometheusScalar {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Query
    )

    $result = @(
        Invoke-PrometheusInstantQuery -Query $Query
    )

    if ($result.Count -ne 1) {
        throw "Expected one Prometheus series for query: $Query"
    }

    return [double]$result[0].value[1]
}

function Wait-DemoRequestCount {
    param(
        [Parameter(Mandatory = $true)]
        [double]$ExpectedMinimum
    )

    $query = 'sum(demo_http_request_duration_seconds_count{job="demo-app"})'
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(60)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            $count = Get-PrometheusScalar -Query $query

            if ($count -ge $ExpectedMinimum) {
                return $count
            }
        }
        catch {
            # Metric series may not exist until the next scrape.
        }

        Start-Sleep -Seconds 1
    }

    throw "Prometheus did not observe demo request count >= $ExpectedMinimum"
}

function Measure-DemoAverageLatency {
    $sumQuery =
        'sum(demo_http_request_duration_seconds_sum{job="demo-app"})'
    $countQuery =
        'sum(demo_http_request_duration_seconds_count{job="demo-app"})'

    # Each healthy/fault deployment recreates demo-app, so its counters reset.
    # Create exactly one workload observation and wait until Prometheus has
    # scraped the new container's metric series.
    $null = Invoke-RestMethod -Uri "$DemoUrl/work" -TimeoutSec 10

    $null = Wait-DemoRequestCount -ExpectedMinimum 1

    $baselineCount = Get-PrometheusScalar -Query $countQuery
    $baselineSum = Get-PrometheusScalar -Query $sumQuery

    for ($request = 1; $request -le $TrafficRequests; $request += 1) {
        $null = Invoke-RestMethod -Uri "$DemoUrl/work" -TimeoutSec 10
    }

    $expectedCount = $baselineCount + $TrafficRequests

    # Do not guess when the next scrape happens.
    # Wait until Prometheus itself proves that the workload was observed.
    $null = Wait-DemoRequestCount -ExpectedMinimum $expectedCount

    $finalCount = Get-PrometheusScalar -Query $countQuery
    $finalSum = Get-PrometheusScalar -Query $sumQuery

    $countDelta = $finalCount - $baselineCount
    $sumDelta = $finalSum - $baselineSum

    if ($countDelta -le 0) {
        throw "No demo workload requests were observed by Prometheus"
    }

    if ($sumDelta -lt 0) {
        throw "Prometheus latency counter decreased inside the measurement"
    }

    $averageLatency = $sumDelta / $countDelta

    if (
        [double]::IsNaN($averageLatency) -or
        [double]::IsInfinity($averageLatency) -or
        $averageLatency -lt 0
    ) {
        throw "Calculated average latency is invalid"
    }

    return $averageLatency
}

function Deploy-Healthy {
    Invoke-Compose -Arguments @("up", "-d", "--force-recreate", "demo-app")
    Wait-DemoReady -ExpectedDelayMs $HealthyDelayMs
    Start-Sleep -Seconds $ScrapeSettleSeconds
    Wait-PrometheusDemoTarget
}

function Deploy-Fault {
    Invoke-Compose -Fault -Arguments @("up", "-d", "--force-recreate", "demo-app")
    Wait-DemoReady -ExpectedDelayMs $FaultDelayMs
    Start-Sleep -Seconds $ScrapeSettleSeconds
    Wait-PrometheusDemoTarget
}

function Restore-Healthy {
    Invoke-Compose -Arguments @("up", "-d", "--force-recreate", "demo-app")
    Wait-DemoReady -ExpectedDelayMs $HealthyDelayMs
}

if ($Runs -lt 1) {
    throw "Runs must be at least 1"
}

if ($TrafficRequests -lt 1) {
    throw "TrafficRequests must be at least 1"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker is required"
}

# Ensure the current Prometheus configuration, including the demo-app scrape job,
# is loaded even when an existing development container was already running.
Invoke-Compose -Arguments @("build", "demo-app")
Invoke-Compose -Arguments @("up", "-d", "prometheus")
Invoke-Compose -Arguments @("restart", "prometheus")

$results = @()

try {
    for ($run = 1; $run -le $Runs; $run += 1) {
        Write-Host ""
        Write-Host "Run $run"

        Deploy-Healthy
        $baselineLatency = Measure-DemoAverageLatency

        Deploy-Fault
        $faultLatency = Measure-DemoAverageLatency

        $ratio = if ($baselineLatency -gt 0) {
            $faultLatency / $baselineLatency
        }
        else {
            [double]::PositiveInfinity
        }

        $passed = (
            $faultLatency -ge $MinimumFaultLatencySeconds -and
            $ratio -ge $MinimumLatencyRatio
        )

        Write-Host ("Baseline latency: {0:N4}s" -f $baselineLatency)
        Write-Host ("Fault latency:    {0:N4}s" -f $faultLatency)
        Write-Host ("Increase:         {0:N2}x" -f $ratio)
        Write-Host ("Result:           {0}" -f $(if ($passed) { "PASS" } else { "FAIL" }))

        $results += [pscustomobject]@{
            Run = $run
            BaselineLatency = $baselineLatency
            FaultLatency = $faultLatency
            Ratio = $ratio
            Passed = $passed
        }

        Restore-Healthy
    }
}
finally {
    Write-Host ""
    Write-Host "Restoring healthy demo-app configuration..."
    Restore-Healthy
}

$passedRuns = @($results | Where-Object { $_.Passed }).Count

Write-Host ""
Write-Host "Final Scenario Result"
Write-Host ("{0} / {1} PASS" -f $passedRuns, $Runs)

if ($passedRuns -ne $Runs) {
    exit 1
}
