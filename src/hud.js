import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOKEN_COUNT_MARKER = '"token_count"';

export function resolveCodexHome(override) {
  if (override) {
    return path.resolve(override);
  }
  if (process.env.CODEX_HOME) {
    return process.env.CODEX_HOME;
  }
  return path.join(os.homedir(), ".codex");
}

export async function getHudLine(options = {}) {
  const codexHome = resolveCodexHome(options.codexHome);
  const sessionFile = await findLatestSessionFile(path.join(codexHome, "sessions"));
  if (!sessionFile) {
    return "Codex usage: waiting for session";
  }

  const entry = await readLastTokenCount(sessionFile, options.tailBytes ?? 1024 * 1024);
  if (!entry) {
    return "Codex usage: waiting for token_count";
  }

  return formatUsageLine(convertTokenCount(entry));
}

async function findLatestSessionFile(root) {
  let latest = null;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      let stat;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {
        continue;
      }
      if (!latest || stat.mtimeMs > latest.mtimeMs) {
        latest = { path: fullPath, mtimeMs: stat.mtimeMs };
      }
    }
  }

  await walk(root);
  return latest?.path ?? null;
}

async function readLastTokenCount(file, tailBytes) {
  let handle;
  try {
    handle = await fs.promises.open(file, "r");
    const stat = await handle.stat();
    const start = Math.max(0, stat.size - tailBytes);
    const buffer = Buffer.alloc(stat.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString("utf8").split(/\r?\n/);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line || !line.includes(TOKEN_COUNT_MARKER)) {
        continue;
      }
      const entry = parseTokenCount(line);
      if (entry) {
        return entry;
      }
    }
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
  return null;
}

function parseTokenCount(line) {
  try {
    const entry = JSON.parse(line);
    if (entry?.type === "event_msg" && entry?.payload?.type === "token_count") {
      return entry;
    }
  } catch {
  }
  return null;
}

function convertTokenCount(entry) {
  const payload = entry.payload ?? {};
  const info = payload.info ?? {};
  const limits = payload.rate_limits ?? {};

  return {
    primary: convertLimit(limits.primary),
    secondary: convertLimit(limits.secondary),
    planType: limits.plan_type ?? null,
    totalTokens: number(info.total_token_usage?.total_tokens)
  };
}

function convertLimit(limit) {
  if (!limit) {
    return null;
  }
  const used = number(limit.used_percent, NaN);
  if (Number.isNaN(used)) {
    return null;
  }
  return {
    used,
    resetsIn: formatReset(limit.resets_at)
  };
}

function formatUsageLine(hud) {
  const parts = ["Usage"];
  for (const limit of [hud.primary, hud.secondary]) {
    if (!limit) {
      continue;
    }
    const reset = limit.resetsIn ? ` reset ${limit.resetsIn}` : "";
    parts.push(`${Math.round(limit.used)}%${reset}`);
  }
  if (hud.totalTokens > 0) {
    parts.push(`session ${formatCount(hud.totalTokens)}`);
  }
  return parts.join(" | ");
}

function formatReset(unixSeconds) {
  const seconds = number(unixSeconds);
  if (seconds <= 0) {
    return null;
  }
  const deltaMs = seconds * 1000 - Date.now();
  if (deltaMs <= 60_000) {
    return "now";
  }
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h${String(minutes % 60).padStart(2, "0")}m`;
  }
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes - days * 24 * 60) / 60);
  return `${days}d${hours}h`;
}

function formatCount(value) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(Math.round(value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
