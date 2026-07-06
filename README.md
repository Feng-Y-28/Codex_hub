# Codex Hub

Terminal usage HUD for Codex.

`codex-hub` runs Codex inside a PTY and draws one extra usage row under
Codex's native footer. It works in normal Windows, macOS, and Linux terminals.

```text
gpt-5.5 default | Context 96% left | ~/project
Usage | 66% reset 2h15m | 12% reset 2d10h | session 9.5M
```

Codex Hub does not patch Codex and does not make network requests while
rendering the HUD. It reads local Codex session JSONL files, finds the latest
`token_count` event, and renders account usage plus session token totals.

## Acknowledgements

Codex Hub is inspired by the idea and workflow of `claude-hub`. This project is
a Codex-focused implementation built as a learning exercise and a tribute to
that work.

## Quick Start

Requirements: Node.js 20+, npm, and an installed Codex CLI.

```powershell
npm install -g github:Feng-Y-28/Codex_hub
codex-hub
```

To keep launching Codex with `codex`, install the optional shim:

```powershell
codex-hub-install
```

Open a new terminal, then run:

```powershell
codex
```

The launch chain becomes:

```text
codex -> codex-hub -> original Codex executable
```

The original Codex binary is not modified.

## Usage

Run Codex through the wrapper:

```powershell
codex-hub
```

Pass Codex arguments directly, or use `--` to separate wrapper options from
Codex options:

```powershell
codex-hub --version
codex-hub -- --model gpt-5.5
```

Wrapper options:

```powershell
codex-hub --codex-home "$HOME\.codex" --interval 10
```

## Shim

`codex-hub-install` creates a small `codex` launcher and places its directory
before the original Codex command in the user PATH for new terminals.

Shim location:

```text
~/.codex-hub/bin/codex
%USERPROFILE%\.codex-hub\bin\codex.cmd
```

If Codex is not discoverable on PATH:

```powershell
codex-hub-install --codex-bin "C:\path\to\codex.cmd"
```

Manual install without changing PATH:

```powershell
codex-hub-install --no-path --bin-dir "$HOME\.codex-hub\bin"
```

Uninstall:

```powershell
codex-hub-install --uninstall
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `CODEX_BIN` | Codex executable launched by `codex-hub`. |
| `CODEX_HOME` | Codex home containing `sessions/`. |
| `CODEX_HUB_ORIGINAL_CODEX` | Internal shim target set by `codex-hub-install`. |

Examples:

```powershell
$env:CODEX_BIN="C:\path\to\codex.cmd"
$env:CODEX_HOME="$HOME\.codex"
codex-hub
```

## Data Source

Codex Hub reads the newest `.jsonl` session file under:

```text
%CODEX_HOME%\sessions
%USERPROFILE%\.codex\sessions
```

It uses fields from the latest `token_count` event:

| Field | HUD usage |
| --- | --- |
| `payload.rate_limits.primary.used_percent` | First account usage percentage, usually the short window. |
| `payload.rate_limits.primary.resets_at` | First reset timer. |
| `payload.rate_limits.secondary.used_percent` | Second account usage percentage, usually the long window. |
| `payload.rate_limits.secondary.resets_at` | Second reset timer. |
| `payload.info.total_token_usage.total_tokens` | Session token total. |

## Advanced

Install from a local clone:

```powershell
git clone https://github.com/Feng-Y-28/Codex_hub.git
cd Codex_hub
npm install
npm link
codex-hub
```

This repository also ships a Codex plugin skill for one-off checks from inside
Codex. The plugin is not the terminal overlay.

```powershell
$env:CODEX_HOME="$HOME\.codex"
codex plugin marketplace add Feng-Y-28/Codex_hub
codex plugin add codex-hud@codex-hub
```

Then ask Codex:

```text
Use $codex-hud:codex-hud to show my current context and usage.
```

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

## Troubleshooting

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

`codex-hub: Cannot create process, error code: 193`

Update to the latest version. Windows must resolve `codex.cmd` or `codex.exe`
before the extensionless npm shell shim.

`npm install` fails while installing `node-pty`

Use Node.js 20 or newer. If the package manager cannot use a prebuild for your
platform, install the native build tools required by `node-pty`.

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
