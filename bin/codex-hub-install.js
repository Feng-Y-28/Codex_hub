#!/usr/bin/env node
import { runInstall } from "../src/install-shim.js";

runInstall().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`codex-hub-install: ${message}\n`);
  process.exit(1);
});
