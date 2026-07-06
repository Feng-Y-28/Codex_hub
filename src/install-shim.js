import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODEX_HUB_ENTRY = path.join(PACKAGE_ROOT, "bin", "codex-hub.js");
const DEFAULT_BIN_DIR = path.join(os.homedir(), ".codex-hub", "bin");
const BEGIN_MARKER = "# >>> codex-hub >>>";
const END_MARKER = "# <<< codex-hub <<<";

export async function runInstall(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const binDir = path.resolve(options.binDir || DEFAULT_BIN_DIR);

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  if (options.uninstall) {
    await uninstall({ binDir, yes: options.yes });
    return;
  }

  const originalCodex = options.codexBin
    ? path.resolve(options.codexBin)
    : findOnPath("codex", { ignoreDirs: [binDir] });

  if (!originalCodex) {
    throw new Error("Cannot find the original codex command. Pass --codex-bin <path>.");
  }

  if (!options.yes) {
    const ok = await confirm(
      [
        "Install a codex shim that launches Codex through codex-hub?",
        `Shim directory: ${binDir}`,
        `Original codex: ${originalCodex}`,
        "This does not modify the Codex binary. It changes PATH precedence for new terminals."
      ].join("\n")
    );
    if (!ok) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  await fs.promises.mkdir(binDir, { recursive: true });
  await writeShim({ binDir, originalCodex });

  const pathChanged = options.noPath ? false : ensurePath(binDir);
  process.stdout.write(`Installed codex shim in ${binDir}\n`);
  process.stdout.write(`Original codex: ${originalCodex}\n`);
  if (options.noPath) {
    process.stdout.write(`Add this directory before the original Codex directory in PATH: ${binDir}\n`);
  } else if (pathChanged) {
    process.stdout.write("Updated user PATH. Open a new terminal, then run: codex\n");
  } else {
    process.stdout.write("PATH already contains the shim directory. Run: codex\n");
  }
}

function parseArgs(argv) {
  const options = {
    binDir: undefined,
    codexBin: undefined,
    uninstall: false,
    yes: false,
    noPath: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--bin-dir") {
      options.binDir = argv[++i];
      continue;
    }
    if (arg === "--codex-bin") {
      options.codexBin = argv[++i];
      continue;
    }
    if (arg === "--uninstall") {
      options.uninstall = true;
      continue;
    }
    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }
    if (arg === "--no-path") {
      options.noPath = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function writeShim({ binDir, originalCodex }) {
  if (process.platform === "win32") {
    const cmd = [
      "@ECHO off",
      "SETLOCAL",
      `SET "CODEX_HUB_ORIGINAL_CODEX=${originalCodex}"`,
      `"${process.execPath}" "${CODEX_HUB_ENTRY}" -- %*`
    ].join("\r\n");
    await fs.promises.writeFile(path.join(binDir, "codex.cmd"), `${cmd}\r\n`, "utf8");
    const ps1 = [
      `$env:CODEX_HUB_ORIGINAL_CODEX = ${psQuote(originalCodex)}`,
      `& ${psQuote(process.execPath)} ${psQuote(CODEX_HUB_ENTRY)} -- @args`,
      "exit $LASTEXITCODE"
    ].join("\r\n");
    await fs.promises.writeFile(path.join(binDir, "codex.ps1"), `${ps1}\r\n`, "utf8");
    return;
  }

  const script = [
    "#!/bin/sh",
    `CODEX_HUB_ORIGINAL_CODEX=${shQuote(originalCodex)} exec ${shQuote(process.execPath)} ${shQuote(CODEX_HUB_ENTRY)} -- "$@"`
  ].join("\n");
  const target = path.join(binDir, "codex");
  await fs.promises.writeFile(target, `${script}\n`, "utf8");
  await fs.promises.chmod(target, 0o755);
}

async function uninstall({ binDir, yes }) {
  if (!yes) {
    const ok = await confirm(`Remove codex-hub shims from ${binDir}?`);
    if (!ok) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  for (const name of ["codex", "codex.cmd", "codex.ps1"]) {
    await fs.promises.rm(path.join(binDir, name), { force: true }).catch(() => {});
  }
  removePath(binDir);
  process.stdout.write(`Uninstalled codex-hub shims from ${binDir}\n`);
}

function ensurePath(binDir) {
  if (process.platform === "win32") {
    const userPath = getWindowsUserPath();
    const entries = splitPath(userPath);
    if (entries.length > 0 && samePath(entries[0], binDir)) {
      return false;
    }
    setWindowsUserPath(joinPathEntries([binDir, ...entries.filter((entry) => !samePath(entry, binDir))]));
    return true;
  }

  if (pathContains(process.env.PATH || "", binDir)) {
    return false;
  }

  const profile = chooseUnixProfile();
  const current = fs.existsSync(profile) ? fs.readFileSync(profile, "utf8") : "";
  if (current.includes(BEGIN_MARKER)) {
    return false;
  }
  const block = `\n${BEGIN_MARKER}\nexport PATH=${shQuote(binDir)}":$PATH"\n${END_MARKER}\n`;
  fs.appendFileSync(profile, block, "utf8");
  return true;
}

function removePath(binDir) {
  if (process.platform === "win32") {
    const entries = splitPath(getWindowsUserPath()).filter((entry) => !samePath(entry, binDir));
    setWindowsUserPath(joinPathEntries(entries));
    return;
  }

  const profile = chooseUnixProfile();
  if (!fs.existsSync(profile)) {
    return;
  }
  const text = fs.readFileSync(profile, "utf8");
  const next = text.replace(new RegExp(`\\n?${escapeRegExp(BEGIN_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\n?`, "g"), "\n");
  fs.writeFileSync(profile, next, "utf8");
}

function findOnPath(command, { ignoreDirs = [] } = {}) {
  const dirs = splitPath(process.env.PATH || "");
  const candidates = process.platform === "win32" ? windowsCandidates(command) : [command];
  for (const dir of dirs) {
    if (!dir || ignoreDirs.some((ignored) => samePath(ignored, dir))) {
      continue;
    }
    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate);
      if (isExecutable(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function windowsCandidates(command) {
  if (path.extname(command)) {
    return [command];
  }
  const exts = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [...exts.map((ext) => `${command}${ext.toLowerCase()}`), ...exts.map((ext) => `${command}${ext.toUpperCase()}`), command];
}

function isExecutable(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) {
      return false;
    }
    if (process.platform === "win32") {
      return true;
    }
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getWindowsUserPath() {
  const result = spawnSync("reg", ["query", "HKCU\\Environment", "/v", "Path"], { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  const line = result.stdout.split(/\r?\n/).find((item) => /\sPath\s+REG_/.test(item));
  if (!line) {
    return "";
  }
  return line.replace(/^\s*Path\s+REG_\w+\s+/, "").trim();
}

function setWindowsUserPath(value) {
  const result = spawnSync("reg", ["add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", value, "/f"], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to update HKCU user PATH.");
  }
}

function chooseUnixProfile() {
  const shell = path.basename(process.env.SHELL || "");
  if (shell === "zsh") {
    return path.join(os.homedir(), ".zshrc");
  }
  if (shell === "bash") {
    return path.join(os.homedir(), ".bashrc");
  }
  return path.join(os.homedir(), ".profile");
}

async function confirm(message) {
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message}\nContinue? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function splitPath(value) {
  return value.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}

function joinPathEntries(entries) {
  return entries.filter(Boolean).join(path.delimiter);
}

function pathContains(value, target) {
  return splitPath(value).some((entry) => samePath(entry, target));
}

function samePath(left, right) {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  if (process.platform === "win32") {
    return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
  }
  return resolvedLeft === resolvedRight;
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function helpText() {
  return `Usage: codex-hub-install [options]

Installs a codex command shim that launches Codex through codex-hub.

Options:
  --codex-bin <path>  Path to the original Codex executable or shim
  --bin-dir <path>    Shim directory, default ~/.codex-hub/bin
  --no-path           Write shims but do not update shell/user PATH
  --uninstall         Remove the codex shim and PATH entry
  --yes, -y           Do not prompt for confirmation
  --help, -h          Show this help
`;
}
