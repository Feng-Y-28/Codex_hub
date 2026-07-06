param(
    [string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }),
    [switch]$SetUserCodexHome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$configDir = $CodexHome
$configPath = Join-Path $configDir "config.toml"
$statusLine = 'status_line = ["model-with-reasoning", "context-remaining", "current-dir"]'

New-Item -ItemType Directory -Force -Path $configDir | Out-Null

if (Test-Path -LiteralPath $configPath) {
    $text = Get-Content -LiteralPath $configPath -Raw
} else {
    $text = ""
}

if ($text -match '(?m)^\[tui\]\s*$') {
    if ($text -match '(?m)^status_line\s*=') {
        $text = [regex]::Replace($text, '(?m)^status_line\s*=.*$', $statusLine, 1)
    } else {
        $text = [regex]::Replace($text, '(?m)^\[tui\]\s*$', "[tui]`r`n$statusLine", 1)
    }
} else {
    $text = $text.TrimEnd() + "`r`n`r`n[tui]`r`n$statusLine`r`n"
}

Set-Content -LiteralPath $configPath -Value $text -NoNewline

if ($SetUserCodexHome) {
    [Environment]::SetEnvironmentVariable("CODEX_HOME", $CodexHome, "User")
}

Write-Output "Configured Codex status line in $configPath"
Write-Output $statusLine
