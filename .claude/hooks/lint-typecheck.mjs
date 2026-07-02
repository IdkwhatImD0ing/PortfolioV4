#!/usr/bin/env node
/**
 * PostToolUse hook — runs after Claude edits a file.
 *
 * When the edited file is a TypeScript source under client/, this lints
 * just that file (fast, targeted) and runs the project typecheck (tsc --noEmit).
 * CI gates client on lint -> typecheck -> test, so catching failures here
 * keeps the loop tight instead of failing on push.
 *
 * Exit 2 feeds stderr back to Claude so it can fix the reported errors.
 * Exit 0 = nothing to do / all clean.
 *
 * Tune by narrowing the matcher in .claude/settings.json, or drop the typecheck
 * block below if per-edit tsc feels too slow on your machine.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0); // not invoked as a hook — do nothing
}

const filePath = input?.tool_input?.file_path ?? "";
const norm = filePath.replace(/\\/g, "/");

// Only act on client TS/TSX source (skip declaration files).
if (!/\/client\/.*\.(ts|tsx)$/.test(norm) || norm.endsWith(".d.ts")) {
  process.exit(0);
}

const clientDir = path.join(process.cwd(), "client");
const run = (cmd) =>
  spawnSync(cmd, { cwd: clientDir, encoding: "utf8", shell: true });

const messages = [];

const lint = run(`pnpm exec eslint "${norm}"`);
if (lint.status !== 0) {
  messages.push("ESLint:\n" + ((lint.stdout || "") + (lint.stderr || "")).trim());
}

const tc = run("pnpm run typecheck");
if (tc.status !== 0) {
  messages.push("Typecheck (tsc --noEmit):\n" + ((tc.stdout || "") + (tc.stderr || "")).trim());
}

if (messages.length) {
  console.error(
    `Post-edit checks failed for ${norm}:\n\n${messages.join("\n\n")}\n\nFix these before continuing.`,
  );
  process.exit(2);
}

process.exit(0);
