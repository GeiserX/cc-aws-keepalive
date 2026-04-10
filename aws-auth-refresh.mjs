#!/usr/bin/env node
// Called by Claude Code (awsAuthRefresh) when Bedrock auth fails.
// Checks if credentials were already refreshed in another terminal.
import { execFileSync } from "node:child_process";
import { loadConfig, getRemaining, formatTime } from "./lib.mjs";

const config = loadConfig();
const info = getRemaining(config);

if (info && info.remaining > 0) {
  console.log(
    `Credentials refreshed (valid for ${formatTime(info.remaining)}). Retrying...`
  );
  process.exit(0);
}

// No expiration field, or field configured but unresolvable — fall back to STS
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
