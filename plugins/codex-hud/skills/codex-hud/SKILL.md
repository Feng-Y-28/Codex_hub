---
name: codex-hud
description: Show Codex context and usage percentages from local session JSONL files.
---

# Codex HUD

Use this skill when the user wants a terminal display of Codex context usage or account usage percentages.

The local script is:

```powershell
.\plugins\codex-hud\scripts\codex-hud.ps1
```

Common commands:

```powershell
# Print the latest known Codex context and usage percentages once.
.\plugins\codex-hud\scripts\codex-hud.ps1

# Watch the latest Codex session and refresh every two seconds.
.\plugins\codex-hud\scripts\codex-hud.ps1 -Watch

# Emit machine-readable JSON.
.\plugins\codex-hud\scripts\codex-hud.ps1 -Json
```

The script reads only local files under `$CODEX_HOME\sessions` or `~\.codex\sessions`.
It uses the latest `token_count` event:

- `last_token_usage.total_tokens / model_context_window` for context percentage.
- `rate_limits.primary.used_percent` for the short usage window, usually 5h.
- `rate_limits.secondary.used_percent` for the long usage window, usually 7d.

If the user wants this directly inside Codex TUI, recommend the built-in `/statusline` command first.
Current Codex does not expose a custom statusline hook for third-party usage percentages.
For an integrated terminal row, recommend the `codex-hub` CLI wrapper.
If the user wants to keep typing `codex`, recommend `codex-hub-install` to install the consented command shim.
