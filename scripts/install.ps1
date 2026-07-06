param(
    [string]$Marketplace = "Feng-Y-28/Codex_hub",
    [string]$Plugin = "codex-hud@codex-hub",
    [string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$env:CODEX_HOME = $CodexHome

codex plugin marketplace add $Marketplace
codex plugin add $Plugin

Write-Output "Installed $Plugin from $Marketplace"
Write-Output "Ask Codex: Use `$codex-hud:codex-hud to show my current context and usage."
Write-Output "For integrated terminal HUD usage, install the npm CLI and run:"
Write-Output "  npm install -g github:Feng-Y-28/Codex_hub"
Write-Output "  codex-hub-install"
Write-Output "Then open a new terminal and run:"
Write-Output "  codex"
