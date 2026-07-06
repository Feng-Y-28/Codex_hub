import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import pty from "node-pty";
import { getHudLine } from "./hud.js";

const ESC = "\x1b";
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const SAVE_CURSOR = `${ESC}7`;
const RESTORE_CURSOR = `${ESC}8`;

export async function run() {
  const args = parseArgs(process.argv.slice(2));
  const shell = resolveCodexCommand(args);
  const cols = Math.max(20, process.stdout.columns ?? 80);
  const rows = Math.max(2, process.stdout.rows ?? 24);
  const childRows = Math.max(1, rows - 1);

  const child = pty.spawn(shell.command, shell.args, {
    name: process.env.TERM || "xterm-256color",
    cols,
    rows: childRows,
    cwd: process.cwd(),
    env: {
      ...process.env,
      TERM_PROGRAM: process.env.TERM_PROGRAM || "codex-hub"
    }
  });

  let exited = false;
  let hudLine = "Usage: waiting for Codex";
  let drawTimer = null;
  let pollTimer = null;

  setupRawInput(child);
  process.stdout.write(HIDE_CURSOR);

  const draw = () => {
    if (exited || !process.stdout.isTTY) {
      return;
    }
    const width = Math.max(1, process.stdout.columns ?? cols);
    const height = Math.max(2, process.stdout.rows ?? rows);
    const text = truncate(stripAnsi(hudLine), width - 1).padEnd(width - 1, " ");
    process.stdout.write(`${SAVE_CURSOR}${ESC}[${height};1H${ESC}[7m${text}${ESC}[0m${RESTORE_CURSOR}`);
  };

  const scheduleDraw = () => {
    if (drawTimer) {
      return;
    }
    drawTimer = setTimeout(() => {
      drawTimer = null;
      draw();
    }, 25);
  };

  child.onData((data) => {
    process.stdout.write(data);
    scheduleDraw();
  });

  child.onExit(({ exitCode }) => {
    exited = true;
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    restoreTerminal();
    process.exit(exitCode ?? 0);
  });

  process.stdout.on("resize", () => {
    const width = Math.max(20, process.stdout.columns ?? cols);
    const height = Math.max(2, process.stdout.rows ?? rows);
    child.resize(width, Math.max(1, height - 1));
    scheduleDraw();
  });

  const poll = async () => {
    try {
      hudLine = await getHudLine({ codexHome: args.codexHome });
    } catch (error) {
      hudLine = `Usage: ${error instanceof Error ? error.message : String(error)}`;
    }
    scheduleDraw();
  };

  await poll();
  pollTimer = setInterval(poll, args.intervalMs);

  const shutdown = () => {
    if (exited) {
      return;
    }
    exited = true;
    child.kill();
    restoreTerminal();
    process.exit(130);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", restoreTerminal);
}

function parseArgs(argv) {
  const args = {
    codexHome: undefined,
    intervalMs: 2000,
    commandArgs: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--codex-home") {
      args.codexHome = argv[++i];
      continue;
    }
    if (arg === "--interval") {
      const seconds = Number(argv[++i]);
      if (Number.isFinite(seconds) && seconds > 0) {
        args.intervalMs = Math.round(seconds * 1000);
      }
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    if (arg === "--") {
      args.commandArgs.push(...argv.slice(i + 1));
      break;
    }
    args.commandArgs.push(arg);
  }

  return args;
}

function resolveCodexCommand(args) {
  if (args.commandArgs.length > 0 && !args.commandArgs[0].startsWith("-")) {
    return {
      command: resolveExecutable(args.commandArgs[0]),
      args: args.commandArgs.slice(1)
    };
  }
  return {
    command: resolveExecutable(process.env.CODEX_HUB_ORIGINAL_CODEX || process.env.CODEX_BIN || "codex"),
    args: args.commandArgs
  };
}

function resolveExecutable(command) {
  if (process.platform !== "win32") {
    return command;
  }

  const hasPath = command.includes("\\") || command.includes("/");
  const candidates = candidateNames(command);
  const dirs = hasPath ? [""] : (process.env.PATH || "").split(path.delimiter);

  for (const dir of dirs) {
    for (const candidate of candidates) {
      const fullPath = hasPath ? candidate : path.join(dir, candidate);
      if (fullPath && fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return command;
}

function candidateNames(command) {
  if (path.extname(command)) {
    return [command];
  }
  const exts = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);
  return [...exts.map((ext) => `${command}${ext.toLowerCase()}`), ...exts.map((ext) => `${command}${ext.toUpperCase()}`), command];
}

function setupRawInput(child) {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on("data", (data) => {
    child.write(data.toString("binary"));
  });
}

function restoreTerminal() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdout.write(`${SHOW_CURSOR}${ESC}[0m\n`);
}

function truncate(text, width) {
  if (text.length <= width) {
    return text;
  }
  if (width <= 1) {
    return text.slice(0, width);
  }
  return `${text.slice(0, width - 3)}...`;
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function helpText() {
  return `Usage: codex-hub [options] [-- codex args...]

Runs Codex inside a PTY and renders a usage HUD on the terminal bottom line.

Options:
  --codex-home <path>  Read sessions from this Codex home
  --interval <sec>     HUD refresh interval, default 2
  --help              Show this help

Environment:
  CODEX_BIN            Codex executable to launch, default "codex"
  CODEX_HOME           Codex home used for session JSONL files
`;
}
