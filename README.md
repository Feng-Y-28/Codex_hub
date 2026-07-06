# Codex Hub

Terminal usage HUD for Codex.

`codex-hub` runs Codex inside a PTY and adds one extra usage row under Codex's
native footer. It works in normal Windows, macOS, and Linux terminals.

```text
gpt-5.5 default | Context 96% left | ~/project
Usage | 66% reset 2h15m | 12% reset 2d10h | session 9.5M
```

## Why

Codex already has a built-in TUI status line for model, context, and directory.
It does not currently expose a third-party hook for custom usage metrics.

Codex Hub fills that gap without patching Codex:

- Reads local Codex session JSONL files.
- Finds the latest `token_count` event.
- Renders account usage and session token totals in the terminal.
- Optionally installs a `codex` shim so users keep typing `codex`.

No network request is used for HUD rendering.

## Install

Install from GitHub:

```powershell
npm install -g github:Feng-Y-28/Codex_hub
```

Run Codex through the wrapper:

```powershell
codex-hub
```

Pass Codex arguments after `--`:

```powershell
codex-hub -- --model gpt-5.5
codex-hub -- --version
```

From a local clone:

```powershell
git clone https://github.com/Feng-Y-28/Codex_hub.git
cd Codex_hub
npm install
npm link
codex-hub
```

## Launch With `codex`

If you want the HUD without typing `codex-hub`, install the optional command
shim:

```powershell
codex-hub-install
```

After confirmation, the installer creates a small `codex` launcher:

```text
~/.codex-hub/bin/codex
```

On Windows:

```text
%USERPROFILE%\.codex-hub\bin\codex.cmd
```

The shim directory is placed before the original Codex command in user PATH.
Open a new terminal and run:

```powershell
codex
```

The launch chain becomes:

```text
codex -> codex-hub -> original Codex executable
```

The original Codex binary is not modified.

Uninstall the shim:

```powershell
codex-hub-install --uninstall
```

If Codex is not discoverable on PATH:

```powershell
codex-hub-install --codex-bin "C:\path\to\codex.cmd"
```

Advanced/manual install:

```powershell
codex-hub-install --no-path --bin-dir "$HOME\.codex-hub\bin"
```

## Configuration

If `codex` is not on PATH, point the wrapper at the real executable:

```powershell
$env:CODEX_BIN="C:\path\to\codex.cmd"
codex-hub
```

If your Codex sessions are not under the default home:

```powershell
$env:CODEX_HOME="$HOME\.codex"
codex-hub
```

CLI options:

```powershell
codex-hub --codex-home "$HOME\.codex" --interval 2
```

Environment variables:

| Variable | Purpose |
| --- | --- |
| `CODEX_BIN` | Original Codex command used by `codex-hub`. |
| `CODEX_HUB_ORIGINAL_CODEX` | Internal shim target used by `codex-hub-install`. |
| `CODEX_HOME` | Codex home containing `sessions/`. |

## Codex Plugin

This repository also ships a Codex plugin skill for one-off checks from inside
Codex:

```powershell
$env:CODEX_HOME="$HOME\.codex"
codex plugin marketplace add Feng-Y-28/Codex_hub
codex plugin add codex-hud@codex-hub
```

Then ask Codex:

```text
Use $codex-hud:codex-hud to show my current context and usage.
```

The plugin skill is not the terminal overlay. For the integrated bottom row,
install the CLI wrapper and optionally run `codex-hub-install`.

## Built-In Status Line

Codex's built-in `/statusline` can show native Codex fields. This helper
configures that native footer:

```powershell
.\scripts\configure-statusline.ps1 -SetUserCodexHome
```

It writes:

```toml
[tui]
status_line = ["model-with-reasoning", "context-remaining", "current-dir"]
```

Current Codex does not support injecting Codex Hub's account usage percentages
into `/statusline`. Codex Hub draws a second terminal row instead.

## Data Source

Codex Hub reads the newest session file under:

```text
%CODEX_HOME%\sessions
```

or:

```text
%USERPROFILE%\.codex\sessions
```

It uses fields from the latest `token_count` event:

| Field | HUD usage |
| --- | --- |
| `rate_limits.primary.used_percent` | First account usage percentage, usually the short window. |
| `rate_limits.primary.resets_at` | First reset timer. |
| `rate_limits.secondary.used_percent` | Second account usage percentage, usually the long window. |
| `rate_limits.secondary.resets_at` | Second reset timer. |
| `total_token_usage.total_tokens` | Session token total. |

## Troubleshooting

`codex-hub: Cannot create process, error code: 193`

Update to the latest version. Windows must resolve `codex.cmd`/`codex.exe`
before the extensionless npm shell shim.

`codex` still starts without the HUD

Open a new terminal after `codex-hub-install`. Then check which command wins:

```powershell
Get-Command codex
```

The first result should be under:

```text
%USERPROFILE%\.codex-hub\bin
```

`Codex usage: waiting for session`

Codex Hub has not found a session JSONL file yet. Start Codex once, or set:

```powershell
$env:CODEX_HOME="$HOME\.codex"
```

## Development

```powershell
npm install
npm run check
node ./bin/codex-hub.js -- powershell -NoLogo -NoProfile -Command "Write-Output PTY_OK"
node ./bin/codex-hub-install.js --yes --no-path --bin-dir .tmp-bin --codex-bin "C:\path\to\codex.cmd"
npm pack --dry-run
```

## License

MIT
