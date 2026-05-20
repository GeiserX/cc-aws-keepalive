#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseCredentials } from "./lib.mjs";

const STATE_DIR = join(homedir(), ".config", "cc-aws-keepalive");
const SYNC_STATE_FILE = join(STATE_DIR, ".last-sync");

function shouldSync(config) {
  const cooldown = (config.syncCooldownSeconds || 60) * 1000;
  try {
    const last = parseInt(readFileSync(SYNC_STATE_FILE, "utf8"), 10);
    if (Date.now() - last < cooldown) return false;
  } catch { /* no state file — proceed */ }
  return true;
}

function markSynced() {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(SYNC_STATE_FILE, String(Date.now()), { mode: 0o600 });
  } catch { /* best effort */ }
}

function buildIniBlock(profile, creds, expirationField) {
  let ini = `[${profile}]\n`;
  ini += `aws_access_key_id = ${creds.aws_access_key_id}\n`;
  ini += `aws_secret_access_key = ${creds.aws_secret_access_key}\n`;
  if (creds.aws_session_token) {
    ini += `aws_session_token = ${creds.aws_session_token}\n`;
  }
  if (expirationField && creds[expirationField]) {
    ini += `${expirationField} = ${creds[expirationField]}\n`;
  }
  return ini;
}

function syncSsh(target, ini, config) {
  const timeout = (config.syncTimeoutSeconds || 15) * 1000;
  const remotePath = target.remotePath || "~/.aws/credentials";
  const remoteCmd = `mkdir -p ~/.aws && chmod 700 ~/.aws && cat > ${remotePath}.tmp && chmod 600 ${remotePath}.tmp && mv ${remotePath}.tmp ${remotePath}`;

  let sshBinary = "ssh";
  const sshArgs = [];

  if (target.sshPassword) {
    sshBinary = "sshpass";
    sshArgs.push("-p", target.sshPassword, "ssh");
  }

  sshArgs.push(
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "BatchMode=" + (target.sshPassword ? "no" : "yes"),
    "-o", "ForwardAgent=no",
    "-o", `ConnectTimeout=${Math.ceil(timeout / 1000)}`,
  );

  if (target.sshPassword) {
    sshArgs.push("-o", "PubkeyAuthentication=no");
  }

  if (target.sshArgs) {
    sshArgs.push(...target.sshArgs.split(/\s+/));
  }

  if (target.user) sshArgs.push("-l", target.user);
  sshArgs.push(target.host, remoteCmd);

  const child = spawn(sshBinary, sshArgs, {
    stdio: ["pipe", "ignore", "pipe"],
    timeout,
  });

  child.stdin.write(ini);
  child.stdin.end();

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  const timer = setTimeout(() => child.kill(), timeout);
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      process.stderr.write(`cc-aws-keepalive: sync to ${target.host} failed (exit ${code})${stderr ? ": " + stderr.trim() : ""}\n`);
    }
  });
  child.on("error", (err) => {
    clearTimeout(timer);
    process.stderr.write(`cc-aws-keepalive: sync to ${target.host} error: ${err.message}\n`);
  });
  child.unref();
}

function syncWebhook(target, creds, config) {
  const timeout = (config.syncTimeoutSeconds || 15) * 1000;
  const url = new URL(target.url);

  if (url.protocol !== "https:") {
    process.stderr.write(`cc-aws-keepalive: webhook sync REFUSED — ${target.url} must use https://\n`);
    return;
  }

  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    process.stderr.write("cc-aws-keepalive: webhook sync REFUSED — NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS\n");
    return;
  }

  const payload = JSON.stringify({
    profile: target.remoteProfile || config.profile,
    credentials: {
      aws_access_key_id: creds.aws_access_key_id,
      aws_secret_access_key: creds.aws_secret_access_key,
      aws_session_token: creds.aws_session_token || "",
    },
    timestamp: Date.now(),
  });

  const headers = {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(payload)),
  };
  if (target.headers) {
    for (const [k, v] of Object.entries(target.headers)) {
      headers[k] = v.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || "");
    }
  }

  import("node:https").then(({ request }) => {
    const req = request(url, { method: target.method || "POST", headers, timeout }, (res) => {
      if (res.statusCode >= 400) {
        process.stderr.write(`cc-aws-keepalive: webhook ${target.url} returned ${res.statusCode}\n`);
      }
      res.resume();
    });
    req.on("error", (err) => {
      process.stderr.write(`cc-aws-keepalive: webhook ${target.url} failed: ${err.message}\n`);
    });
    req.on("timeout", () => req.destroy());
    req.write(payload);
    req.end();
  });
}

function syncCommand(target, creds, config) {
  const timeout = (config.syncTimeoutSeconds || 15) * 1000;
  const payload = JSON.stringify({
    profile: target.remoteProfile || config.profile,
    aws_access_key_id: creds.aws_access_key_id,
    aws_secret_access_key: creds.aws_secret_access_key,
    aws_session_token: creds.aws_session_token || "",
    expiration: config.expirationField ? (creds[config.expirationField] || "") : "",
  });

  const child = spawn(target.command, {
    shell: true,
    detached: true,
    stdio: ["pipe", "ignore", "pipe"],
    timeout,
  });

  child.stdin.write(payload);
  child.stdin.end();

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  child.on("close", (code) => {
    if (code !== 0) {
      process.stderr.write(`cc-aws-keepalive: sync command failed (exit ${code})${stderr ? ": " + stderr.trim() : ""}\n`);
    }
  });
  child.on("error", (err) => {
    process.stderr.write(`cc-aws-keepalive: sync command error: ${err.message}\n`);
  });
  child.unref();
}

export function syncCredentials(config) {
  if (!config.syncTargets?.length) return;
  if (!shouldSync(config)) return;

  const creds = parseCredentials(config.profile);
  if (!creds || !creds.aws_access_key_id || !creds.aws_secret_access_key) return;

  if (!creds.aws_session_token) {
    process.stderr.write("cc-aws-keepalive: sync REFUSED — no session token (will not sync long-lived keys)\n");
    return;
  }

  markSynced();

  const profile = config.profile;
  const ini = buildIniBlock(profile, creds, config.expirationField);

  for (const target of config.syncTargets) {
    try {
      const remoteProfile = target.remoteProfile || profile;
      const targetIni = remoteProfile !== profile
        ? buildIniBlock(remoteProfile, creds, config.expirationField)
        : ini;

      switch (target.type) {
        case "ssh":
          syncSsh(target, targetIni, config);
          break;
        case "webhook":
          syncWebhook(target, creds, config);
          break;
        case "command":
          syncCommand(target, creds, config);
          break;
        default:
          process.stderr.write(`cc-aws-keepalive: unknown sync type "${target.type}"\n`);
      }
    } catch (err) {
      process.stderr.write(`cc-aws-keepalive: sync to ${target.host || target.url || "target"} failed: ${err.message}\n`);
    }
  }
}
