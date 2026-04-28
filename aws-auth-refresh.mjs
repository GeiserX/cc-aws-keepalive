#!/usr/bin/env node
// Called by Claude Code (awsAuthRefresh) when Bedrock auth fails.
// Tries auto-login if configured, otherwise prompts user to re-auth manually.
import { execSync, execFileSync } from "node:child_process";
import { loadConfig, getRemaining, formatTime, tryAcquireAutoLoginLock, releaseAutoLoginLock } from "./lib.mjs";

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
      timeout: 15_000,
    });
    console.log("Credentials valid. Retrying...");
    process.exit(0);
  } catch {
    // Creds expired
  }
}

// Try auto-login synchronously (user is blocked anyway — CC waits for this script)
const autoCmd = config.autoLoginCmd || config.loginCmd;
if (autoCmd) {
  if (!tryAcquireAutoLoginLock()) {
    // Another session is already running auto-login — wait for it
    console.log("Another session is already re-authenticating. Waiting...");
    const waitStart = Date.now();
    while (Date.now() - waitStart < 180_000) {
      const check = getRemaining(config);
      if (check && check.remaining > 0) {
        console.log(
          `Credentials refreshed by another session (valid for ${formatTime(check.remaining)}). Retrying...`
        );
        process.exit(0);
      }
      execSync("sleep 3", { stdio: "ignore" });
    }
  } else {
    console.log("AWS credentials expired. Running auto-login...");
    try {
      execSync(autoCmd, { stdio: "inherit", timeout: 180_000 });
      releaseAutoLoginLock();
      const refreshed = getRemaining(config);
      if (refreshed && refreshed.remaining > 0) {
        console.log(
          `Auto-login succeeded (valid for ${formatTime(refreshed.remaining)}). Retrying...`
        );
        process.exit(0);
      }
    } catch {
      releaseAutoLoginLock();
      console.log("Auto-login failed.");
    }
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
