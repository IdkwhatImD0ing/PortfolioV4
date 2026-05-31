#!/usr/bin/env node
/**
 * PostToolUse hook — runs after Claude edits a file.
 *
 * The TS counterpart (lint-typecheck.mjs) only guards client-new/. This is the
 * backend mirror: when the edited file is a Python source under server/ or
 * pinecone/, it lint-checks just that file with Ruff so issues surface in the
 * edit loop instead of on push (backend-integration.yml runs pytest in CI).
 *
 * Ruff is run via `uvx ruff` so it works without adding ruff to the project's
 * deps — uv fetches it into an ephemeral env on first use. If uv/uvx isn't
 * available the hook degrades to a `py_compile` syntax check, and if neither is
 * available it does nothing (exit 0) rather than blocking edits.
 *
 * Exit 2 feeds stderr back to Claude so it can fix the reported errors.
 * Exit 0 = nothing to do / all clean / tooling unavailable.
 *
 * Tune by narrowing the matcher in .claude/settings.json, or swap `uvx ruff`
 * for a project-pinned `uv run ruff` once ruff is added to server/pyproject.toml.
 */
import { spawnSync } from "node:child_process";

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

// Only act on backend Python source (server/ and pinecone/ ingestion).
if (!/\/(server|pinecone)\/.*\.py$/.test(norm)) {
  process.exit(0);
}

const run = (cmd, args) =>
  spawnSync(cmd, args, { encoding: "utf8", shell: true });

// Prefer Ruff (fast, full lint). uvx fetches it on demand without touching deps.
const ruff = run("uvx", ["ruff", "check", `"${norm}"`]);

// status 1 == lint violations found. Other failures (uv/uvx missing, network)
// shouldn't block the edit — fall through to a best-effort syntax check.
if (ruff.status === 1 && (ruff.stdout || ruff.stderr)) {
  console.error(
    `Ruff found issues in ${norm}:\n\n${((ruff.stdout || "") + (ruff.stderr || "")).trim()}\n\nFix these before continuing.`,
  );
  process.exit(2);
}

if (ruff.status === 0) {
  process.exit(0); // ruff ran clean
}

// Ruff unavailable — fall back to a syntax-only compile check.
const compile = run("python", ["-m", "py_compile", `"${norm}"`]);
if (compile.status !== 0 && (compile.stdout || compile.stderr)) {
  console.error(
    `Python syntax error in ${norm}:\n\n${((compile.stdout || "") + (compile.stderr || "")).trim()}\n\nFix this before continuing.`,
  );
  process.exit(2);
}

process.exit(0);
