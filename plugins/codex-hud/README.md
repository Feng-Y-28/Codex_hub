# Codex HUD

Terminal HUD for Codex context and usage percentages.

It reads the latest local Codex session JSONL file under `%CODEX_HOME%\sessions`
or `%USERPROFILE%\.codex\sessions` and renders the newest `token_count` event.

```powershell
.\scripts\codex-hud.ps1
.\scripts\codex-hud.ps1 -Watch
.\scripts\codex-hud.ps1 -Json
```

Output example:

```text
CTX  68.5% [########----] 177k/258k | 5h 17% reset 4h12m | 7d 4% reset 6d22h | session 1.4M
```

The context percentage is computed from `last_token_usage.total_tokens /
model_context_window`. Account usage comes from `rate_limits.primary` and
`rate_limits.secondary`.

Codex has a built-in `/statusline` for the in-TUI footer, but current Codex
does not expose a custom statusline command hook. For an integrated terminal
row, install the `codex-hub` CLI wrapper. To keep launching with `codex`, run
`codex-hub-install` once and approve the command shim.
