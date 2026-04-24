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
  loginCmd: "",
  autoLoginCmd: "",
  autoLoginMinutes: 0,
  warnMinutes: 30,
  timerWarnMinutes: 60,
  statusLineCmd: "",
};

export function loadConfig() {
  const config = { ...DEFAULTS };
  if (existsSync(CONFIG_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      // Warn on unknown keys
      for (const key of Object.keys(parsed)) {
        if (!(key in DEFAULTS)) {
          process.stderr.write(`cc-aws-keepalive: unknown config key "${key}" (typo?)\n`);
        }
      }
      // Type-coerce numeric fields, warn on bad types
      for (const [key, def] of Object.entries(DEFAULTS)) {
        if (key in parsed) {
          const val = parsed[key];
          const expected = typeof def;
          if (expected === "number" && typeof val === "string") {
            const num = Number(val);
            if (!isNaN(num)) { parsed[key] = num; }
            else { process.stderr.write(`cc-aws-keepalive: "${key}" should be a number, got "${val}"\n`); }
          } else if (expected === "string" && typeof val !== "string") {
            process.stderr.write(`cc-aws-keepalive: "${key}" should be a string, got ${typeof val}\n`);
            parsed[key] = String(val);
          }
        }
      }
      Object.assign(config, parsed);
    } catch (e) {
      process.stderr.write(`cc-aws-keepalive: config.json is malformed (${e.message}). Using defaults.\n`);
    }
  }
  // Env override
  if (process.env.CC_KEEPALIVE_PROFILE) {
    config.profile = process.env.CC_KEEPALIVE_PROFILE;
  }
  // Warn about ineffective auto-login config
  if (config.autoLoginMinutes > 0 && !config.expirationField) {
    process.stderr.write("cc-aws-keepalive: autoLoginMinutes requires expirationField to be set. Auto-login disabled.\n");
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
  if (h > 0) return `${h}h${m}m`;
  return m > 0 ? `${m}m` : "<1m";
}
