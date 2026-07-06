param(
    [switch]$Watch,
    [switch]$Json,
    [switch]$NoColor,
    [string]$CodexHome,
    [string]$Session,
    [int]$IntervalSeconds = 2,
    [int]$TailLines = 2000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-CodexHome {
    param([string]$Override)

    if ($Override) {
        return (Resolve-Path -LiteralPath $Override).Path
    }
    if ($env:CODEX_HOME) {
        return $env:CODEX_HOME
    }
    return Join-Path $HOME ".codex"
}

function Find-SessionFile {
    param(
        [string]$CodexHomePath,
        [string]$SessionId
    )

    $sessionsDir = Join-Path $CodexHomePath "sessions"
    if (-not (Test-Path -LiteralPath $sessionsDir -PathType Container)) {
        throw "Codex sessions directory not found: $sessionsDir"
    }

    if ($SessionId) {
        $matches = Get-ChildItem -LiteralPath $sessionsDir -Recurse -File -Filter "*.jsonl" |
            Where-Object { $_.Name -like "*$SessionId*" -or $_.FullName -like "*$SessionId*" } |
            Sort-Object LastWriteTime -Descending
        if ($matches.Count -gt 0) {
            return $matches[0].FullName
        }
        throw "No Codex session file matched: $SessionId"
    }

    $latest = Get-ChildItem -LiteralPath $sessionsDir -Recurse -File -Filter "*.jsonl" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $latest) {
        throw "No Codex session JSONL files found under: $sessionsDir"
    }
    return $latest.FullName
}

function Read-LastTokenCount {
    param(
        [string]$Path,
        [int]$Tail
    )

    $last = $null
    $lines = @()
    try {
        $lines = Get-Content -LiteralPath $Path -Tail $Tail -ErrorAction Stop
    } catch {
        $lines = @()
    }

    foreach ($line in $lines) {
        if (-not $line -or $line.IndexOf('"token_count"') -lt 0) {
            continue
        }
        try {
            $entry = $line | ConvertFrom-Json -ErrorAction Stop
            if ($entry.type -eq "event_msg" -and $entry.payload.type -eq "token_count") {
                $last = $entry
            }
        } catch {
        }
    }

    if ($last) {
        return $last
    }

    foreach ($line in [System.IO.File]::ReadLines($Path)) {
        if (-not $line -or $line.IndexOf('"token_count"') -lt 0) {
            continue
        }
        try {
            $entry = $line | ConvertFrom-Json -ErrorAction Stop
            if ($entry.type -eq "event_msg" -and $entry.payload.type -eq "token_count") {
                $last = $entry
            }
        } catch {
        }
    }
    return $last
}

function Get-Number {
    param($Value, [double]$Default = 0)

    if ($null -eq $Value) {
        return $Default
    }
    try {
        return [double]$Value
    } catch {
        return $Default
    }
}

function Format-Count {
    param([double]$Value)

    if ($Value -ge 1000000) {
        return ("{0:n1}M" -f ($Value / 1000000.0))
    }
    if ($Value -ge 1000) {
        return ("{0:n0}k" -f ($Value / 1000.0))
    }
    return ("{0:n0}" -f $Value)
}

function Format-Reset {
    param($UnixSeconds)

    $seconds = Get-Number $UnixSeconds 0
    if ($seconds -le 0) {
        return $null
    }
    $reset = [DateTimeOffset]::FromUnixTimeSeconds([int64]$seconds).LocalDateTime
    $delta = $reset - (Get-Date)
    if ($delta.TotalMinutes -lt 1) {
        return "now"
    }
    if ($delta.TotalHours -lt 24) {
        return ("{0}h{1:00}m" -f [math]::Floor($delta.TotalHours), $delta.Minutes)
    }
    return ("{0}d{1}h" -f [math]::Floor($delta.TotalDays), $delta.Hours)
}

function Format-WindowLabel {
    param($Minutes)

    $m = [int](Get-Number $Minutes 0)
    if ($m -eq 300) {
        return "5h"
    }
    if ($m -eq 10080) {
        return "7d"
    }
    if ($m -gt 0 -and $m % 1440 -eq 0) {
        return ("{0}d" -f ($m / 1440))
    }
    if ($m -gt 0 -and $m % 60 -eq 0) {
        return ("{0}h" -f ($m / 60))
    }
    if ($m -gt 0) {
        return ("{0}m" -f $m)
    }
    return "limit"
}

function Colorize {
    param(
        [string]$Text,
        [double]$Percent
    )

    if ($NoColor) {
        return $Text
    }
    $esc = [char]27
    if ($Percent -ge 90) {
        return "$esc[31m$Text$esc[0m"
    }
    if ($Percent -ge 70) {
        return "$esc[33m$Text$esc[0m"
    }
    return "$esc[32m$Text$esc[0m"
}

function New-Bar {
    param(
        [double]$Percent,
        [int]$Width = 12
    )

    $pct = [math]::Max(0, [math]::Min(100, $Percent))
    $filled = [int][math]::Round(($pct / 100.0) * $Width)
    $empty = $Width - $filled
    return ("[" + ("#" * $filled) + ("-" * $empty) + "]")
}

function Convert-TokenCountToHud {
    param(
        $Entry,
        [string]$SessionPath
    )

    if (-not $Entry) {
        return $null
    }

    $payload = $Entry.payload
    $info = $payload.info
    $lastUsage = $info.last_token_usage
    $totalUsage = $info.total_token_usage
    $window = Get-Number $info.model_context_window 0
    $lastTokens = Get-Number $lastUsage.total_tokens 0
    $contextPct = if ($window -gt 0) {
        [math]::Round([math]::Min(100, ($lastTokens / $window) * 100), 1)
    } else {
        0
    }

    $primary = $payload.rate_limits.primary
    $secondary = $payload.rate_limits.secondary
    $primaryPct = Get-Number $primary.used_percent -1
    $secondaryPct = Get-Number $secondary.used_percent -1

    return [pscustomobject]@{
        timestamp = $Entry.timestamp
        session_file = $SessionPath
        context = [pscustomobject]@{
            used_percent = $contextPct
            remaining_percent = [math]::Round([math]::Max(0, 100 - $contextPct), 1)
            last_turn_tokens = [int64]$lastTokens
            window_tokens = [int64]$window
            input_tokens = [int64](Get-Number $lastUsage.input_tokens 0)
            cached_input_tokens = [int64](Get-Number $lastUsage.cached_input_tokens 0)
            output_tokens = [int64](Get-Number $lastUsage.output_tokens 0)
            reasoning_output_tokens = [int64](Get-Number $lastUsage.reasoning_output_tokens 0)
        }
        usage = [pscustomobject]@{
            primary = [pscustomobject]@{
                label = Format-WindowLabel $primary.window_minutes
                used_percent = $(if ($primaryPct -ge 0) { $primaryPct } else { $null })
                resets_in = Format-Reset $primary.resets_at
            }
            secondary = [pscustomobject]@{
                label = Format-WindowLabel $secondary.window_minutes
                used_percent = $(if ($secondaryPct -ge 0) { $secondaryPct } else { $null })
                resets_in = Format-Reset $secondary.resets_at
            }
            plan_type = $payload.rate_limits.plan_type
            limit_id = $payload.rate_limits.limit_id
        }
        session_tokens = [pscustomobject]@{
            total = [int64](Get-Number $totalUsage.total_tokens 0)
            input = [int64](Get-Number $totalUsage.input_tokens 0)
            cached_input = [int64](Get-Number $totalUsage.cached_input_tokens 0)
            output = [int64](Get-Number $totalUsage.output_tokens 0)
            reasoning_output = [int64](Get-Number $totalUsage.reasoning_output_tokens 0)
        }
    }
}

function Format-HudLine {
    param($Hud)

    if (-not $Hud) {
        return "Codex HUD: no token_count event found yet"
    }

    $ctx = $Hud.context.used_percent
    $ctxText = ("CTX {0,5:n1}% {1} {2}/{3}" -f $ctx, (New-Bar $ctx), (Format-Count $Hud.context.last_turn_tokens), (Format-Count $Hud.context.window_tokens))
    $ctxText = Colorize $ctxText $ctx

    $parts = @($ctxText)
    foreach ($window in @($Hud.usage.primary, $Hud.usage.secondary)) {
        if ($null -ne $window.used_percent) {
            $usage = [double]$window.used_percent
            $suffix = if ($window.resets_in) { " reset $($window.resets_in)" } else { "" }
            $part = ("{0} {1:n0}%{2}" -f $window.label, $usage, $suffix)
            $parts += (Colorize $part $usage)
        }
    }
    $parts += ("session {0}" -f (Format-Count $Hud.session_tokens.total))
    return ($parts -join " | ")
}

function Invoke-Once {
    $homePath = Resolve-CodexHome $CodexHome
    $sessionPath = Find-SessionFile $homePath $Session
    $entry = Read-LastTokenCount $sessionPath $TailLines
    $hud = Convert-TokenCountToHud $entry $sessionPath

    if ($Json) {
        if ($hud) {
            $hud | ConvertTo-Json -Depth 8
        } else {
            [pscustomobject]@{
                session_file = $sessionPath
                error = "no token_count event found"
            } | ConvertTo-Json -Depth 4
        }
        return
    }

    Format-HudLine $hud
}

if ($IntervalSeconds -lt 1) {
    $IntervalSeconds = 1
}

if ($Watch) {
    while ($true) {
        try {
            $line = Invoke-Once
        } catch {
            $line = "Codex HUD: $($_.Exception.Message)"
        }
        Write-Host "`r$($line.PadRight([Math]::Max($line.Length, [Console]::WindowWidth - 1)))" -NoNewline
        Start-Sleep -Seconds $IntervalSeconds
    }
} else {
    Invoke-Once
}
