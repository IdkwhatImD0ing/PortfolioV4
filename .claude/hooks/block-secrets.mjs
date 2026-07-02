#!/usr/bin/env node
/**
 * PreToolUse hook — runs before Claude writes/edits a file.
 *
 * Blocks edits to real secret files (server/.env, client/.env.local, etc.)
 * which are populated from GCP Secret Manager / hold the Retell key. Example and
 * template files (.env.local.example, *.sample, *.template) are allowed so the
 * documented placeholders can still be maintained.
 *
 * Exit 2 denies the tool call and shows the reason to Claude.
 */
let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

const filePath = (input?.tool_input?.file_path ?? "").replace(/\\/g, "/");
const base = filePath.split("/").pop() || "";

// A dotenv file: ".env", ".env.local", ".env.production", server/.env, etc.
const isEnv = /(^|\/)\.env($|\.)/.test(filePath);
// Templates/examples are safe to edit.
const isTemplate = /\.(example|sample|template|dist)$/.test(base) || base.includes("example");

if (isEnv && !isTemplate) {
  console.error(
    `Blocked: "${base}" looks like a real secrets file.\n` +
      `Edit the committed template (e.g. .env.local.example) instead, or pull ` +
      `secrets via 'make pull-secrets'. If this edit is genuinely intended, ` +
      `remove/adjust the block-secrets PreToolUse hook in .claude/settings.json.`,
  );
  process.exit(2);
}

process.exit(0);
