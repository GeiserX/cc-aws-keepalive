#!/usr/bin/env node
// OMC HUD integration: intercepts stdout, appends AWS session timer.
// Called via `import` from omc-hud.mjs — do not run standalone.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function awsTimer() {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".config", "cc-aws-keepalive", "config.json"), "utf8")
    );
    if (!cfg.expirationField) return "";
    const lines = readFileSync(join(homedir(), ".aws", "credentials"), "utf8").split(/\r?\n/);
    let inProfile = false, exp = 0;
    for (const l of lines) {
      const t = l.trim();
      if (/^\[/.test(t)) { inProfile = t === `[${cfg.profile}]`; continue; }
      if (inProfile && t.includes(cfg.expirationField)) {
        exp = parseInt(t.slice(t.indexOf("=") + 1).trim(), 10);
        break;
      }
    }
    if (!exp) return "";
    const rem = exp - Math.floor(Date.now() / 1000);
    const h = Math.floor(rem / 3600), m = Math.floor((rem % 3600) / 60);
    const text = rem <= 0 ? "EXPIRED" : h > 0 ? `${h}h${m}m` : `${m}m`;
    const warnSec = (cfg.timerWarnMinutes || 60) * 60;
    if (rem <= 0) return `\x1b[31maws:${text}\x1b[0m`;
    if (rem <= warnSec) return `\x1b[33maws:${text}\x1b[0m`;
    return `aws:${text}`;
  } catch { return ""; }
}

export function patchStdout() {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  process.on("exit", () => {
    process.stdout.write = origWrite;
    const lines = chunks.join("").split("\n").filter(l => l.length > 0);
    const timer = awsTimer();
    if (lines.length > 0 && timer) lines[0] += " | " + timer;
    else if (timer) lines.push(timer);
    if (lines.length > 0) origWrite(lines.join("\n") + "\n");
  });
}
