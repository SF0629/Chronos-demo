[CmdletBinding()]
param(
    [string]$ApiUrl = "http://localhost:4000",
    [string]$WebUrl = "http://localhost:3000",
    [string]$DemoUrl = "http://localhost:4100",
    [string]$PrometheusUrl = "http://localhost:9090",
    [string]$RepositoryFullName = "SF0629/Chronos-demo",
    [string]$WebhookSecret = "",
    [int]$TrafficRequests = 12,
    [int]$MetricWindowSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$HealthyDelayMs = 20
$FaultDelayMs = 600
$MinimumFaultLatencySeconds = 0.4
$MinimumLatencyRatio = 5.0
$PollTimeoutSeconds = 90
$BaselinePreparationPaddingSeconds = 10
$DemoServiceName = "Chronos Demo Service"
$DemoServiceDescription = "WBS 7.2 end-to-end demo service"
$DemoPrometheusJob = "demo-app"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot "infra/docker-compose.yml"
$FaultComposeFile = Join-Path $RepoRoot "infra/docker-compose.demo-fault.yml"
$RootEnvFile = Join-Path $RepoRoot ".env"

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

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($PollTimeoutSeconds)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri "$DemoUrl/health" -TimeoutSec 3

            if (
                $health.status -eq "ok" -and
                [int]$health.delayMs -eq $ExpectedDelayMs
            ) {
                return $health
            }
        }
        catch {
            # Container recreation can briefly refuse connections.
        }

        Start-Sleep -Seconds 1
    }

    throw "Demo app did not become ready with DEMO_DELAY_MS=$ExpectedDelayMs"
}

function Get-DemoContainerIdentity {
    $containerId = (
        & docker compose -f $ComposeFile ps -q demo-app
    ).Trim()

    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
        throw "Unable to resolve the running demo-app container id"
    }

    $inspect = (
        & docker inspect `
            --format '{{.Id}}|{{.State.StartedAt}}|{{.State.Running}}' `
            $containerId
    ).Trim()

    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($inspect)) {
        throw "Unable to inspect the running demo-app container"
    }

    $parts = $inspect -split '\|', 3

    if ($parts.Count -ne 3 -or $parts[2] -ne "true") {
        throw "demo-app container is not running"
    }

    return [pscustomobject]@{
        Id = $parts[0]
        StartedAt = [DateTimeOffset]::Parse($parts[1])
    }
}

function Invoke-PrometheusInstantQuery {
    param([Parameter(Mandatory = $true)][string]$Query)

    $encodedQuery = [System.Uri]::EscapeDataString($Query)
    $response = Invoke-RestMethod `
        -Uri "$PrometheusUrl/api/v1/query?query=$encodedQuery" `
        -TimeoutSec 5

    if ($response.status -ne "success") {
        throw "Prometheus instant query failed: $Query"
    }

    return @($response.data.result)
}

function Wait-PrometheusDemoTarget {
    param([Parameter(Mandatory = $true)][DateTimeOffset]$After)

    $minimumTimestamp = $After.ToUnixTimeMilliseconds() / 1000.0
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($PollTimeoutSeconds)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            $result = @(
                Invoke-PrometheusInstantQuery -Query 'up{job="demo-app"}'
            )

            if ($result.Count -eq 1) {
                $sampleTimestamp = [double]$result[0].value[0]
                $sampleValue = [double]$result[0].value[1]

                if (
                    $sampleValue -eq 1 -and
                    $sampleTimestamp -ge $minimumTimestamp
                ) {
                    return $sampleTimestamp
                }
            }
        }
        catch {
            # Prometheus can be waiting for a scrape after recreation.
        }

        Start-Sleep -Seconds 1
    }

    throw (
        'Prometheus did not scrape an up{job="demo-app"}=1 sample after ' +
        $After
    )
}

function Get-PrometheusScalar {
    param([Parameter(Mandatory = $true)][string]$Query)

    $result = @(
        Invoke-PrometheusInstantQuery -Query $Query
    )

    if ($result.Count -ne 1) {
        throw "Expected one Prometheus series for query: $Query"
    }

    return [double]$result[0].value[1]
}

function Wait-DemoMetricScrapeAfter {
    param([Parameter(Mandatory = $true)][DateTimeOffset]$After)

    $query = 'max(timestamp(demo_http_request_duration_seconds_count{job="demo-app"}))'
    $minimumTimestamp = $After.ToUnixTimeMilliseconds() / 1000.0
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($PollTimeoutSeconds)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            $sampleTimestamp = Get-PrometheusScalar -Query $query

            if ($sampleTimestamp -ge $minimumTimestamp) {
                return $sampleTimestamp
            }
        }
        catch {
            # A fresh labeled histogram series appears only after /work.
        }

        Start-Sleep -Seconds 1
    }

    throw "Prometheus did not scrape demo workload metrics after $After"
}

function Wait-DemoRequestCount {
    param([Parameter(Mandatory = $true)][double]$ExpectedMinimum)

    $query = 'sum(demo_http_request_duration_seconds_count{job="demo-app"})'
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($PollTimeoutSeconds)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            $count = Get-PrometheusScalar -Query $query

            if ($count -ge $ExpectedMinimum) {
                return $count
            }
        }
        catch {
            # The series may not exist until the next scrape.
        }

        Start-Sleep -Seconds 1
    }

    throw "Prometheus did not observe demo request count >= $ExpectedMinimum"
}

function Measure-DemoAverageLatency {
    param([int]$RequestCount = $TrafficRequests)

    $sumQuery = 'sum(demo_http_request_duration_seconds_sum{job="demo-app"})'
    $countQuery = 'sum(demo_http_request_duration_seconds_count{job="demo-app"})'

    $null = Invoke-RestMethod -Uri "$DemoUrl/work" -TimeoutSec 10
    $warmupCompletedAt = [DateTimeOffset]::UtcNow
    $null = Wait-DemoMetricScrapeAfter -After $warmupCompletedAt
    $null = Wait-DemoRequestCount -ExpectedMinimum 1

    $baselineCount = Get-PrometheusScalar -Query $countQuery
    $baselineSum = Get-PrometheusScalar -Query $sumQuery

    $actualTotalSeconds = 0.0

    for ($request = 1; $request -le $RequestCount; $request += 1) {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

        try {
            $null = Invoke-RestMethod -Uri "$DemoUrl/work" -TimeoutSec 10
        }
        finally {
            $stopwatch.Stop()
        }

        $actualTotalSeconds += $stopwatch.Elapsed.TotalSeconds
    }

    $trafficCompletedAt = [DateTimeOffset]::UtcNow
    $expectedCount = $baselineCount + $RequestCount
    $null = Wait-DemoRequestCount -ExpectedMinimum $expectedCount
    $null = Wait-DemoMetricScrapeAfter -After $trafficCompletedAt

    $finalCount = Get-PrometheusScalar -Query $countQuery
    $finalSum = Get-PrometheusScalar -Query $sumQuery

    $countDelta = $finalCount - $baselineCount
    $sumDelta = $finalSum - $baselineSum

    if ($countDelta -lt $RequestCount -or $sumDelta -lt 0) {
        throw (
            "Unable to calculate demo latency from observed Prometheus counter growth. " +
            "expectedDelta=$RequestCount actualDelta=$countDelta"
        )
    }

    $prometheusAverageLatency = $sumDelta / $countDelta
    $actualAverageLatency = $actualTotalSeconds / $RequestCount

    if (
        [double]::IsNaN($prometheusAverageLatency) -or
        [double]::IsInfinity($prometheusAverageLatency) -or
        $prometheusAverageLatency -lt 0 -or
        [double]::IsNaN($actualAverageLatency) -or
        [double]::IsInfinity($actualAverageLatency) -or
        $actualAverageLatency -lt 0
    ) {
        throw "Calculated average latency is invalid"
    }

    return [pscustomobject]@{
        ActualAverageLatency = $actualAverageLatency
        PrometheusAverageLatency = $prometheusAverageLatency
        ObservedRequestCount = $countDelta
    }
}

function Invoke-FaultTrafficAfterIncident {
    $countQuery = 'sum(demo_http_request_duration_seconds_count{job="demo-app"})'
    $baselineCount = Get-PrometheusScalar -Query $countQuery

    for ($request = 1; $request -le $TrafficRequests; $request += 1) {
        $null = Invoke-RestMethod -Uri "$DemoUrl/work" -TimeoutSec 10
    }

    $null = Wait-DemoRequestCount `
        -ExpectedMinimum ($baselineCount + $TrafficRequests)
}

function Prepare-CleanBaselineWindow {
    $durationSeconds = $MetricWindowSeconds + $BaselinePreparationPaddingSeconds
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($durationSeconds)

    Write-Host "Preparing ${MetricWindowSeconds}s healthy metric window..."

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $null = Invoke-RestMethod -Uri "$DemoUrl/work" -TimeoutSec 10
        Start-Sleep -Seconds 2
    }
}

function Invoke-ApiJson {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body = $null
    )

    $parameters = @{
        Method = $Method
        Uri = "$ApiUrl$Path"
        TimeoutSec = 10
    }

    if ($null -ne $Body) {
        $parameters.ContentType = "application/json"
        $parameters.Body = $Body | ConvertTo-Json -Depth 12 -Compress
    }

    return Invoke-RestMethod @parameters
}

function Get-DemoServiceMatches {
    $response = Invoke-RestMethod -Uri "$ApiUrl/services" -TimeoutSec 10
    $services = @($response)

    return @(
        $services |
            Where-Object {
                [string]$_.name -eq $DemoServiceName -and
                [string]$_.prometheusJob -eq $DemoPrometheusJob
            } |
            Sort-Object `
                @{ Expression = { [DateTimeOffset]::Parse([string]$_.createdAt) } }, `
                @{ Expression = { [string]$_.id } }
    )
}

function Resolve-DemoService {
    $matchesBefore = @(Get-DemoServiceMatches)
    $service = $null
    $created = $false

    if ($matchesBefore.Count -gt 0) {
        $service = $matchesBefore[0]
    }
    else {
        $service = Invoke-ApiJson `
            -Method "POST" `
            -Path "/services" `
            -Body @{
                name = $DemoServiceName
                description = $DemoServiceDescription
                prometheusJob = $DemoPrometheusJob
            }
        $created = $true
    }

    $matchesAfter = @(Get-DemoServiceMatches)

    if ($null -eq $service -or [string]::IsNullOrWhiteSpace([string]$service.id)) {
        throw "Demo Service bootstrap did not resolve an id"
    }

    $selected = @(
        $matchesAfter | Where-Object { [string]$_.id -eq [string]$service.id }
    )

    if ($selected.Count -ne 1) {
        throw "Selected demo Service is not present in GET /services"
    }

    $expectedAfterCount = if ($matchesBefore.Count -eq 0) { 1 } else { $matchesBefore.Count }

    if ($matchesAfter.Count -ne $expectedAfterCount) {
        throw (
            "Demo Service row count changed unexpectedly. " +
            "before=$($matchesBefore.Count) after=$($matchesAfter.Count)"
        )
    }

    if ($matchesBefore.Count -gt 1) {
        Write-Warning (
            "Existing duplicate demo Services detected ($($matchesBefore.Count)). " +
            "Reusing deterministic Service id=$($service.id); no new duplicate was created."
        )
    }

    return [pscustomobject]@{
        Service = $service
        Created = $created
        CountBefore = $matchesBefore.Count
        CountAfter = $matchesAfter.Count
    }
}

function Get-ServiceEvents {
    param([Parameter(Mandatory = $true)][string]$ServiceId)

    return @(
        Invoke-RestMethod `
            -Uri "$ApiUrl/services/$ServiceId/events" `
            -TimeoutSec 10
    )
}

function Wait-GitHubEvent {
    param(
        [Parameter(Mandatory = $true)][string]$ServiceId,
        [Parameter(Mandatory = $true)][string]$DeliveryId
    )

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($PollTimeoutSeconds)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $events = Get-ServiceEvents -ServiceId $ServiceId
        $event = $events | Where-Object {
            $_.source -eq "github" -and
            $_.type -eq "github.push" -and
            $_.source_event_id -eq $DeliveryId
        } | Select-Object -First 1

        if ($null -ne $event) {
            return $event
        }

        Start-Sleep -Seconds 1
    }

    throw "GitHub push event was not persisted for the demo service"
}

function Wait-DockerEvent {
    param(
        [Parameter(Mandatory = $true)][string]$ServiceId,
        [Parameter(Mandatory = $true)][DateTimeOffset]$After
    )

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($PollTimeoutSeconds)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $events = Get-ServiceEvents -ServiceId $ServiceId
        $event = $events | Where-Object {
            $_.source -eq "docker" -and
            $_.type -like "docker.container.*" -and
            [DateTimeOffset]::Parse([string]$_.occurred_at) -ge $After
        } | Sort-Object {
            [DateTimeOffset]::Parse([string]$_.occurred_at)
        } -Descending | Select-Object -First 1

        if ($null -ne $event) {
            return $event
        }

        Start-Sleep -Seconds 1
    }

    throw (
        "No Docker event was persisted after fault recreate. " +
        "Confirm the Agent is running with: npm run dev -w apps/agent"
    )
}

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()

        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separator = $trimmed.IndexOf("=")

        if ($separator -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $separator).Trim()

        if ($key -ne $Name) {
            continue
        }

        $value = $trimmed.Substring($separator + 1).Trim()

        if (
            $value.Length -ge 2 -and
            (($value.StartsWith('"') -and $value.EndsWith('"')) -or
             ($value.StartsWith("'") -and $value.EndsWith("'")))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        return $value
    }

    return $null
}

function Resolve-WebhookSecret {
    if (-not [string]::IsNullOrWhiteSpace($WebhookSecret)) {
        return $WebhookSecret
    }

    if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_WEBHOOK_SECRET)) {
        return $env:GITHUB_WEBHOOK_SECRET
    }

    $fromFile = Get-DotEnvValue `
        -Path $RootEnvFile `
        -Name "GITHUB_WEBHOOK_SECRET"

    if (-not [string]::IsNullOrWhiteSpace($fromFile)) {
        return $fromFile
    }

    throw (
        "GitHub webhook secret is required. Pass -WebhookSecret, set " +
        "GITHUB_WEBHOOK_SECRET, or define it in root .env without modifying it."
    )
}

function Send-SignedGitHubPush {
    param(
        [Parameter(Mandatory = $true)][string]$Secret,
        [Parameter(Mandatory = $true)][string]$DeliveryId
    )

    $repositoryName = ($RepositoryFullName -split "/")[-1]
    $afterCommit = "2222222222222222222222222222222222222222"
    $payload = [ordered]@{
        ref = "refs/heads/dev"
        before = "1111111111111111111111111111111111111111"
        after = $afterCommit
        repository = [ordered]@{
            name = $repositoryName
            full_name = $RepositoryFullName
            html_url = "https://github.com/$RepositoryFullName"
        }
        pusher = [ordered]@{
            name = "chronos-demo"
            email = "chronos-demo@example.invalid"
        }
        forced = $false
        compare = "https://github.com/$RepositoryFullName/compare/1111111...2222222"
        head_commit = [ordered]@{
            id = $afterCommit
            message = "Chronos demo fault deployment"
            timestamp = [DateTimeOffset]::UtcNow.ToString("o")
            url = "https://github.com/$RepositoryFullName/commit/$afterCommit"
        }
    }

    $payloadJson = $payload | ConvertTo-Json -Depth 8 -Compress
    $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payloadJson)
    $secretBytes = [System.Text.Encoding]::UTF8.GetBytes($Secret)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new($secretBytes)

    try {
        $hash = $hmac.ComputeHash($payloadBytes)
    }
    finally {
        $hmac.Dispose()
    }

    $signature = "sha256=" + (
        [System.BitConverter]::ToString($hash).Replace("-", "").ToLowerInvariant()
    )

    $headers = @{
        "x-github-event" = "push"
        "x-github-delivery" = $DeliveryId
        "x-hub-signature-256" = $signature
    }

    $response = Invoke-WebRequest `
        -Method Post `
        -Uri "$ApiUrl/webhooks/github" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $payloadBytes `
        -TimeoutSec 10 `
        -UseBasicParsing

    if ([int]$response.StatusCode -ne 200) {
        throw "GitHub webhook replay returned HTTP $($response.StatusCode)"
    }
}

function Wait-IncidentMetricSummary {
    param([Parameter(Mandatory = $true)][string]$IncidentId)

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($PollTimeoutSeconds)
    $uri = (
        "$ApiUrl/incidents/$IncidentId/metric-summary" +
        "?windowSeconds=$MetricWindowSeconds"
    )

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            return Invoke-RestMethod -Uri $uri -TimeoutSec 10
        }
        catch {
            $statusCode = $null

            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            catch {
                $statusCode = $null
            }

            if ($statusCode -ne 422) {
                throw
            }
        }

        Start-Sleep -Seconds 2
    }

    throw "Incident metric summary did not become available"
}

function Test-IncidentPage {
    param(
        [Parameter(Mandatory = $true)][string]$IncidentId,
        [Parameter(Mandatory = $true)][string]$IncidentTitle,
        [Parameter(Mandatory = $true)][string]$GitHubTitle,
        [Parameter(Mandatory = $true)][string]$DockerTitle
    )

    $uri = "$WebUrl/incidents/$IncidentId"
    $response = Invoke-WebRequest `
        -Uri $uri `
        -TimeoutSec 20 `
        -UseBasicParsing

    if ([int]$response.StatusCode -ne 200) {
        throw "Incident page returned HTTP $($response.StatusCode)"
    }

    $content = [string]$response.Content

    foreach ($requiredText in @(
        $IncidentTitle,
        "Related Changes",
        "Metric Summary",
        "Timeline",
        $GitHubTitle,
        $DockerTitle
    )) {
        if (-not $content.Contains($requiredText)) {
            throw "Incident page is missing expected content: $requiredText"
        }
    }

    if ($content.Contains("Metric summary is unavailable")) {
        throw "Incident page rendered the metric unavailable state"
    }

    $githubOccurrences = [regex]::Matches(
        $content,
        [regex]::Escape($GitHubTitle)
    ).Count
    $dockerOccurrences = [regex]::Matches(
        $content,
        [regex]::Escape($DockerTitle)
    ).Count

    if ($githubOccurrences -lt 2 -or $dockerOccurrences -lt 2) {
        throw (
            "GitHub and Docker events must appear in both Related Changes " +
            "and Timeline"
        )
    }

    return $uri
}

function Restore-ServiceEnvironment {
    param(
        [bool]$PreviouslyExisted,
        [AllowNull()][string]$PreviousValue
    )

    if ($PreviouslyExisted) {
        $env:CHRONOS_DEMO_SERVICE_ID = $PreviousValue
    }
    else {
        Remove-Item Env:CHRONOS_DEMO_SERVICE_ID -ErrorAction SilentlyContinue
    }
}

if ($TrafficRequests -lt 1) {
    throw "TrafficRequests must be at least 1"
}

if ($MetricWindowSeconds -lt 1) {
    throw "MetricWindowSeconds must be at least 1"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop / docker CLI is required"
}

# Preflight the processes that this script intentionally does not supervise.
$apiHealth = Invoke-RestMethod -Uri "$ApiUrl/health" -TimeoutSec 5

if ($apiHealth.status -ne "ok") {
    throw "Chronos API health check failed"
}

$null = Invoke-PrometheusInstantQuery -Query 'up{job="prometheus"}'
$webPreflight = Invoke-WebRequest -Uri $WebUrl -TimeoutSec 10 -UseBasicParsing

if ([int]$webPreflight.StatusCode -ne 200) {
    throw "Chronos Web preflight failed"
}

$secret = Resolve-WebhookSecret
$hadServiceEnvironment = Test-Path Env:CHRONOS_DEMO_SERVICE_ID
$previousServiceEnvironment = if ($hadServiceEnvironment) {
    $env:CHRONOS_DEMO_SERVICE_ID
}
else {
    $null
}

$serviceId = $null
$incidentId = $null
$githubEvent = $null
$dockerEvent = $null
$baselineLatency = $null
$faultLatency = $null
$baselineActualLatency = $null
$faultActualLatency = $null
$serviceCountBefore = $null
$serviceCountAfter = $null
$serviceCountFinal = $null
$serviceBootstrapMode = $null
$healthyContainer = $null
$faultContainer = $null
$healthyHealth = $null
$faultHealth = $null
$healthyScrapeTimestamp = $null
$faultScrapeTimestamp = $null
$incidentPageUrl = $null

try {
    $serviceResolution = Resolve-DemoService
    $service = $serviceResolution.Service
    $serviceId = [string]$service.id
    $serviceCountBefore = [int]$serviceResolution.CountBefore
    $serviceCountAfter = [int]$serviceResolution.CountAfter
    $serviceBootstrapMode = if ([bool]$serviceResolution.Created) { "CREATED" } else { "REUSED" }

    $binding = Invoke-ApiJson `
        -Method "PUT" `
        -Path "/services/$serviceId/source-bindings" `
        -Body @{
            source = "github"
            resourceType = "repository"
            externalId = $RepositoryFullName
        }

    if ([string]$binding.serviceId -ne $serviceId) {
        throw "GitHub source binding did not resolve to the demo service"
    }

    $deliveryId = [Guid]::NewGuid().ToString()
    Send-SignedGitHubPush -Secret $secret -DeliveryId $deliveryId
    $githubEvent = Wait-GitHubEvent `
        -ServiceId $serviceId `
        -DeliveryId $deliveryId

    $env:CHRONOS_DEMO_SERVICE_ID = $serviceId

    Invoke-Compose -Arguments @(
        "up", "-d", "--force-recreate", "demo-app"
    )
    $healthyContainer = Get-DemoContainerIdentity
    $healthyHealth = Wait-DemoReady -ExpectedDelayMs $HealthyDelayMs
    $healthyReadyAt = [DateTimeOffset]::UtcNow
    $healthyScrapeTimestamp = Wait-PrometheusDemoTarget -After $healthyReadyAt

    # Flush old demo-app fault samples from the 60-second incident window and
    # continuously create healthy observations for a reproducible baseline.
    Prepare-CleanBaselineWindow
    $baselineMeasurement = Measure-DemoAverageLatency
    $baselineActualLatency = [double]$baselineMeasurement.ActualAverageLatency
    $baselineLatency = [double]$baselineMeasurement.PrometheusAverageLatency

    $faultDeploymentStartedAt = [DateTimeOffset]::UtcNow.AddSeconds(-2)
    Invoke-Compose -Fault -Arguments @(
        "up", "-d", "--force-recreate", "demo-app"
    )
    $faultContainer = Get-DemoContainerIdentity
    $faultHealth = Wait-DemoReady -ExpectedDelayMs $FaultDelayMs
    $faultReadyAt = [DateTimeOffset]::UtcNow
    $faultScrapeTimestamp = Wait-PrometheusDemoTarget -After $faultReadyAt

    if ([string]$faultContainer.Id -eq [string]$healthyContainer.Id) {
        throw "Fault deployment did not recreate the demo-app container"
    }

    $dockerEvent = Wait-DockerEvent `
        -ServiceId $serviceId `
        -After $faultDeploymentStartedAt

    # Establish a fresh fault-process counter baseline, then require one new
    # completed /work request to appear in Prometheus before calculating latency.
    $faultMeasurement = Measure-DemoAverageLatency -RequestCount 1
    $faultActualLatency = [double]$faultMeasurement.ActualAverageLatency
    $faultLatency = [double]$faultMeasurement.PrometheusAverageLatency
    $latencyRatio = if ($baselineLatency -gt 0) { $faultLatency / $baselineLatency } else { [double]::PositiveInfinity }

    if (
        $faultLatency -lt $MinimumFaultLatencySeconds -or
        $latencyRatio -lt $MinimumLatencyRatio
    ) {
        throw (
            "Fault latency did not meet the demo threshold. " +
            "baseline=$baselineLatency fault=$faultLatency ratio=$latencyRatio"
        )
    }

    $incidentTitle = "Demo latency incident"
    $incident = Invoke-ApiJson `
        -Method "POST" `
        -Path "/incidents" `
        -Body @{
            serviceId = $serviceId
            title = $incidentTitle
        }

    $incidentId = [string]$incident.id

    if ([string]::IsNullOrWhiteSpace($incidentId)) {
        throw "Incident creation did not return an id"
    }

    Invoke-FaultTrafficAfterIncident

    $metricSummary = Wait-IncidentMetricSummary -IncidentId $incidentId

    $beforeAverageLatency = [double]$metricSummary.before.averageLatency
    $afterAverageLatency = [double]$metricSummary.after.averageLatency

    if (
        [double]::IsNaN($beforeAverageLatency) -or
        [double]::IsInfinity($beforeAverageLatency) -or
        [double]::IsNaN($afterAverageLatency) -or
        [double]::IsInfinity($afterAverageLatency) -or
        [double]$metricSummary.before.requestCount -le 0 -or
        [double]$metricSummary.after.requestCount -le 0
    ) {
        throw "Incident metric summary returned invalid values"
    }

    $summaryRatio = if ($beforeAverageLatency -gt 0) {
        $afterAverageLatency / $beforeAverageLatency
    } else {
        [double]::PositiveInfinity
    }

    if (
        [double]$metricSummary.after.averageLatency -lt $MinimumFaultLatencySeconds -or
        $summaryRatio -lt $MinimumLatencyRatio
    ) {
        throw (
            "Incident metric summary did not show the expected latency increase. " +
            "before=$($metricSummary.before.averageLatency) " +
            "after=$($metricSummary.after.averageLatency) ratio=$summaryRatio"
        )
    }

    $correlation = Invoke-RestMethod `
        -Uri "$ApiUrl/incidents/$incidentId/correlation" `
        -TimeoutSec 10

    $related = @($correlation.relatedEvents)
    $timeline = @($correlation.timeline)
    $githubRelated = @($related | Where-Object {
        $_.event.source -eq "github" -and $_.event.type -eq "github.push"
    })
    $dockerRelated = @($related | Where-Object {
        $_.event.source -eq "docker" -and $_.event.type -like "docker.container.*"
    })
    $githubTimeline = @($timeline | Where-Object {
        $_.event.source -eq "github" -and $_.event.type -eq "github.push"
    })
    $dockerTimeline = @($timeline | Where-Object {
        $_.event.source -eq "docker" -and $_.event.type -like "docker.container.*"
    })

    if (
        $githubRelated.Count -lt 1 -or
        $dockerRelated.Count -lt 1 -or
        $githubTimeline.Count -lt 1 -or
        $dockerTimeline.Count -lt 1
    ) {
        throw (
            "Correlation/timeline did not include both GitHub and Docker events"
        )
    }

    $incidentPageUrl = Test-IncidentPage `
        -IncidentId $incidentId `
        -IncidentTitle $incidentTitle `
        -GitHubTitle ([string]$githubEvent.title) `
        -DockerTitle ([string]$dockerEvent.title)

    $serviceCountFinal = @(Get-DemoServiceMatches).Count

    if ($serviceCountFinal -ne $serviceCountAfter) {
        throw (
            "Demo Service row count changed during the E2E run. " +
            "afterBootstrap=$serviceCountAfter final=$serviceCountFinal"
        )
    }

    Write-Host ""
    Write-Host "E2E Incident Result"
    Write-Host ""
    Write-Host "Service ID: $serviceId"
    Write-Host "Service bootstrap: $serviceBootstrapMode"
    Write-Host "Demo Service rows: before=$serviceCountBefore after=$serviceCountFinal"
    Write-Host ""
    Write-Host "GitHub Event: PASS"
    Write-Host "Docker Event: PASS"
    Write-Host "Healthy container: $($healthyContainer.Id)"
    Write-Host "Healthy container startedAt: $($healthyContainer.StartedAt.ToString('o'))"
    Write-Host "Fault container: $($faultContainer.Id)"
    Write-Host "Fault container startedAt: $($faultContainer.StartedAt.ToString('o'))"
    Write-Host "Healthy /health delayMs: $($healthyHealth.delayMs)"
    Write-Host "Fault /health delayMs: $($faultHealth.delayMs)"
    Write-Host ""
    Write-Host ("Healthy actual latency: {0:N4}s" -f $baselineActualLatency)
    Write-Host ("Healthy Prometheus measurement: {0:N4}s" -f $baselineLatency)
    Write-Host "Healthy Prometheus request delta: $($baselineMeasurement.ObservedRequestCount)"
    Write-Host ("Fault actual latency: {0:N4}s" -f $faultActualLatency)
    Write-Host ("Fault Prometheus measurement: {0:N4}s" -f $faultLatency)
    Write-Host "Fault Prometheus request delta: $($faultMeasurement.ObservedRequestCount)"
    Write-Host ("Baseline/fault ratio: {0:N2}x" -f $latencyRatio)
    Write-Host ("Healthy Prometheus scrape timestamp: {0:N3}" -f $healthyScrapeTimestamp)
    Write-Host ("Fault Prometheus scrape timestamp: {0:N3}" -f $faultScrapeTimestamp)
    Write-Host "Metric change: PASS"
    Write-Host ""
    Write-Host "Incident ID: $incidentId"
    Write-Host ""
    Write-Host "Correlation:"
    Write-Host "GitHub PASS"
    Write-Host "Docker PASS"
    Write-Host ""
    Write-Host "Metric Summary: PASS"
    Write-Host ("Metric Summary before: {0:N4}s" -f $beforeAverageLatency)
    Write-Host ("Metric Summary after: {0:N4}s" -f $afterAverageLatency)
    Write-Host ("Metric Summary ratio: {0:N2}x" -f $summaryRatio)
    Write-Host ""
    Write-Host "Incident Page:"
    Write-Host $incidentPageUrl
    Write-Host ""
    Write-Host "Final Result: PASS"
}
finally {
    $cleanupErrors = @()

    try {
        Restore-ServiceEnvironment `
            -PreviouslyExisted $hadServiceEnvironment `
            -PreviousValue $previousServiceEnvironment
    }
    catch {
        $cleanupErrors += (
            "Failed to restore CHRONOS_DEMO_SERVICE_ID: " +
            $_.Exception.Message
        )
    }

    try {
        Invoke-Compose -Arguments @(
            "up", "-d", "--force-recreate", "demo-app"
        )
        $restoredHealth = Wait-DemoReady -ExpectedDelayMs $HealthyDelayMs
        Write-Host "Healthy restore: PASS (delayMs=$($restoredHealth.delayMs))"
    }
    catch {
        $cleanupErrors += (
            "Failed to restore healthy demo-app configuration: " +
            $_.Exception.Message
        )
    }

    if ($cleanupErrors.Count -gt 0) {
        throw ($cleanupErrors -join "; ")
    }
}
