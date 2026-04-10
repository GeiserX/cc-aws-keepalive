#!/usr/bin/env node
// Cross-platform installer for cc-aws-keepalive
import { existsSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const home = homedir();
const configDir = join(home, ".config", "cc-aws-keepalive");
const configFile = join(configDir, "config.json");
const scriptDir = resolve(__dirname);

// Detect OMC
const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(home, ".claude");
const omcHud = join(claudeConfigDir, "hud", "omc-hud.mjs");
const hasOmc = existsSync(omcHud);

// Detect existing settings
let settings = {};
const settingsPath = join(claudeConfigDir, "settings.json");
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch { /* ignore */ }
}

console.log("cc-aws-keepalive installer\n");

// 1. Config
if (!existsSync(configFile)) {
  mkdirSync(configDir, { recursive: true });
  copyFileSync(join(__dirname, "config.example.json"), configFile);
  console.log(`Created: ${configFile}`);
  console.log("Edit it to set your AWS profile, expiration field, and login command.\n");
} else {
  console.log(`Config exists: ${configFile} (not overwritten)\n`);
}

// 2. Detect plugin vs manual install
const isPlugin = existsSync(join(__dirname, ".claude-plugin", "plugin.json"));

// 3. Core settings (always needed)
console.log("=== Add to ~/.claude/settings.json ===\n");

if (isPlugin) {
  console.log("Plugin detected — the UserPromptSubmit hook is auto-registered.");
  console.log("You only need to add the credential settings:\n");
  console.log(JSON.stringify({
    awsCredentialExport: `node ${scriptDir}/aws-cred-export.mjs`,
    awsAuthRefresh: `node ${scriptDir}/aws-auth-refresh.mjs`,
  }, null, 2));
} else {
  console.log("Core (credential refresh + proactive hook):\n");
  console.log(JSON.stringify({
    awsCredentialExport: `node ${scriptDir}/aws-cred-export.mjs`,
    awsAuthRefresh: `node ${scriptDir}/aws-auth-refresh.mjs`,
    hooks: {
      UserPromptSubmit: [{
        matcher: "",
        hooks: [{
          type: "command",
          command: `node ${scriptDir}/aws-cred-check.mjs`,
        }],
      }],
    },
  }, null, 2));
}

// 4. Status line (conditional)
if (hasOmc) {
  console.log("\n\nOMC detected — keep your existing statusLine as-is.");
  console.log("The UserPromptSubmit hook will warn you before expiry.");
  console.log("\nTo also see a persistent timer, add to config.json:");
  console.log(`  "statusLineCmd": "node ${omcHud}"`);
  console.log("Then set statusLine to:");
  console.log(JSON.stringify({
    statusLine: {
      type: "command",
      command: `node ${scriptDir}/aws-statusline.mjs`,
    },
  }, null, 2));
  console.log("\nNote: this replaces OMC's statusLine detection. If OMC shows");
  console.log('"NOT configured" warnings, revert to OMC\'s statusLine and rely');
  console.log("on the hook-based warnings instead.\n");
} else {
  console.log("\n\nOptional — show session timer in status bar:\n");
  console.log(JSON.stringify({
    statusLine: {
      type: "command",
      command: `node ${scriptDir}/aws-statusline.mjs`,
    },
  }, null, 2));
}

console.log("\nDone.");
