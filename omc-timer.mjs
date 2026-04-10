#!/usr/bin/env node
// OMC HUD integration: intercepts stdout, appends AWS session timer.
// Called via `import` from omc-hud.mjs — do not run standalone.
import { loadConfig, getRemaining, formatTime } from "./lib.mjs";

function awsTimer() {
  try {
    const config = loadConfig();
    const info = getRemaining(config);
    if (!info) return "";
    const text = formatTime(info.remaining);
    const warnSec = config.timerWarnMinutes * 60;
    if (info.remaining <= 0) return `\x1b[31maws:${text}\x1b[0m`;
    if (info.remaining <= warnSec) return `\x1b[33maws:${text}\x1b[0m`;
    return `aws:${text}`;
  } catch { return ""; }
}

export function patchStdout() {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(String(chunk));
    if (typeof encoding === "function") encoding();
    else if (typeof callback === "function") callback();
    return true;
  };
  process.on("exit", () => {
    process.stdout.write = origWrite;
    const lines = chunks.join("").split("\n").filter(l => l.length > 0);
    const timer = awsTimer();
    if (lines.length > 0 && timer) lines[0] += " | " + timer;
    else if (timer) lines.push(timer);
    if (lines.length > 0) origWrite(lines.join("\n") + "\n");
  });
}
