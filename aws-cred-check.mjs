#!/usr/bin/env node
// UserPromptSubmit hook: proactive AWS credential expiry check.
// Warns via stderr if expired or nearing expiry (never blocks — blocked prompts are discarded by CC).
// Optionally auto-renews credentials when within autoLoginMinutes window.
import { execSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, getRemaining, formatTime } from "./lib.mjs";

const config = loadConfig();
const warnSeconds = config.warnMinutes * 60;
const autoLoginSeconds = (config.autoLoginMinutes || 0) * 60;
let remaining = null;

const info = getRemaining(config);
if (info) {
  remaining = info.remaining;
} else {
  // No expiration field, or field configured but unresolvable — fall back to STS
  try {
    execFileSync("aws", ["sts", "get-caller-identity", "--profile", config.profile], {
      stdio: "ignore",
    });
    process.exit(0); // Valid, can't determine remaining time
  } catch {
    remaining = -1;
  }
}

// Auto-login: re-authenticate when within the configured window
const autoCmd = config.autoLoginCmd || config.loginCmd;
if (autoLoginSeconds > 0 && autoCmd && remaining > 0 && remaining <= autoLoginSeconds) {
  const stateDir = join(homedir(), ".config", "cc-aws-keepalive");
  const lockFile = join(stateDir, ".last-auto-login");
  const cooldownSec = 300; // Don't retry more than once per 5 minutes
  let shouldRun = true;

  if (existsSync(lockFile)) {
    try {
      const lastAttempt = parseInt(readFileSync(lockFile, "utf8").trim(), 10);
      if (Date.now() / 1000 - lastAttempt < cooldownSec) shouldRun = false;
    } catch { /* corrupt file — run anyway */ }
  }

  if (shouldRun) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(lockFile, String(Math.floor(Date.now() / 1000)));
    try {
      // Spawn detached so it doesn't block the prompt (may need MFA push)
      const { spawn } = await import("node:child_process");
      const child = spawn("sh", ["-c", autoCmd], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      process.stderr.write(
        `AWS auto-login started in background (${formatTime(remaining)} remaining).\n`
      );
    } catch {
      process.stderr.write(
        `Auto-login failed. Run manually: ${config.loginCmd}\n`
      );
    }
  }
}

if (remaining <= 0) {
  const action = config.loginCmd
    ? `Run: ${config.loginCmd}`
    : "Re-authenticate";
  process.stderr.write(
    `⚠ AWS credentials EXPIRED. ${action} in another terminal — CC will auto-retry via awsAuthRefresh.\n`
  );
} else if (remaining <= warnSeconds) {
  const hint = config.loginCmd ? ` Run soon: ${config.loginCmd}` : " Re-authenticate soon.";
  process.stderr.write(
    `AWS session expires in ${formatTime(remaining)}.${hint}\n`
  );
}
