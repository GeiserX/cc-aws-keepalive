#!/usr/bin/env node
// Called by Claude Code (awsAuthRefresh) when Bedrock auth fails.
// Tries auto-login if configured, otherwise prompts user to re-auth manually.
import { execSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, getRemaining, formatTime } from "./lib.mjs";

const config = loadConfig();

// Check if a background auto-login (from cred-check) already refreshed creds
const info = getRemaining(config);
if (info && info.remaining > 0) {
  console.log(
    `Credentials refreshed (valid for ${formatTime(info.remaining)}). Retrying...`
  );
  process.exit(0);
}

// No expiration field — fall back to STS
if (!info) {
  try {
    execFileSync("aws", ["sts", "get-caller-identity", "--profile", config.profile], {
      stdio: "ignore",
    });
    console.log("Credentials valid. Retrying...");
    process.exit(0);
  } catch {
    // Creds expired
  }
}

// Try auto-login synchronously (user is blocked anyway — CC waits for this script)
const autoCmd = config.autoLoginCmd || "";
if (autoCmd) {
  console.log("AWS credentials expired. Running auto-login...");
  try {
    execSync(autoCmd, { stdio: "inherit", timeout: 180_000 });
    const refreshed = getRemaining(config);
    if (refreshed && refreshed.remaining > 0) {
      console.log(
        `Auto-login succeeded (valid for ${formatTime(refreshed.remaining)}). Retrying...`
      );
      process.exit(0);
    }
  } catch {
    console.log("Auto-login failed.");
  }
}

console.log("");
console.log("AWS credentials expired.");
if (config.loginCmd) {
  console.log(`Run in another terminal:  ${config.loginCmd}`);
} else {
  console.log("Re-authenticate in another terminal.");
}
console.log(
  "Then come back here - CC will retry automatically on your next message."
);
console.log("");
process.exit(1);
