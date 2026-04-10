#!/usr/bin/env node
// UserPromptSubmit hook: proactive AWS credential expiry check.
// Blocks prompt if expired, warns via stderr if nearing expiry.
import { execSync } from "node:child_process";
import { loadConfig, getRemaining, formatTime } from "./lib.mjs";

const config = loadConfig();
const warnSeconds = config.warnMinutes * 60;
let remaining = null;

const info = getRemaining(config);
if (info) {
  remaining = info.remaining;
} else if (!config.expirationField) {
  // STS fallback
  try {
    execSync(`aws sts get-caller-identity --profile ${config.profile}`, {
      stdio: "ignore",
    });
    process.exit(0); // Valid, can't determine remaining time
  } catch {
    remaining = -1;
  }
} else {
  process.exit(0); // Can't determine, let it through
}

if (remaining <= 0) {
  const escaped = config.loginCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const msg = `AWS credentials EXPIRED. Run in another terminal:  ${escaped}  — then come back and retry your message.`;
  process.stdout.write(JSON.stringify({ decision: "block", reason: msg }) + "\n");
} else if (remaining <= warnSeconds) {
  process.stderr.write(
    `AWS session expires in ${formatTime(remaining)}. Run soon: ${config.loginCmd}\n`
  );
}
