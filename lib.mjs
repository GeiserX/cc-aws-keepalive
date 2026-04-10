import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(
  homedir(),
  ".config",
  "cc-aws-keepalive",
  "config.json"
);

const DEFAULTS = {
  profile: "default",
  expirationField: "",
  loginCmd: "aws sso login --profile default",
  warnMinutes: 30,
  timerWarnMinutes: 60,
  statusLineCmd: "",
};

export function loadConfig() {
  const config = { ...DEFAULTS };
  if (existsSync(CONFIG_PATH)) {
    try {
      Object.assign(config, JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
    } catch {
      // Bad config — use defaults
    }
  }
  // Env override
  if (process.env.CC_KEEPALIVE_PROFILE) {
    config.profile = process.env.CC_KEEPALIVE_PROFILE;
  }
  return config;
}

export function parseCredentials(profile) {
  const credsPath = join(homedir(), ".aws", "credentials");
  if (!existsSync(credsPath)) return null;

  const content = readFileSync(credsPath, "utf8");
  const lines = content.split(/\r?\n/);
  const result = {};
  let inProfile = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const profileMatch = trimmed.match(/^\[(.+)\]$/);
    if (profileMatch) {
      inProfile = profileMatch[1] === profile;
      continue;
    }
    if (inProfile && trimmed.includes("=")) {
      const eqIdx = trimmed.indexOf("=");
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      result[key] = val;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function getRemaining(config) {
  const creds = parseCredentials(config.profile);
  if (!creds || !config.expirationField) return null;

  const exp = parseInt(creds[config.expirationField], 10);
  if (isNaN(exp)) return null;

  return { remaining: exp - Math.floor(Date.now() / 1000), expiration: exp };
}

export function formatTime(seconds) {
  if (seconds <= 0) return "EXPIRED";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}
