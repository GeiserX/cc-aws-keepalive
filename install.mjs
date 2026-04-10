#!/usr/bin/env node
// Cross-platform installer for cc-aws-keepalive
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
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

// 4. Status line timer
const MARKER = "// [cc-aws-keepalive:timer-start]";

if (hasOmc) {
  const hudContent = readFileSync(omcHud, "utf8");
  if (hudContent.includes(MARKER)) {
    console.log("\n\nOMC HUD already patched with AWS timer.");
  } else {
    // Find insertion point: after the last top-level import statement
    const lines = hudContent.split("\n");
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith("import ")) {
        insertIdx = i + 1;
      }
    }

    const timerPath = join(scriptDir, "omc-timer.mjs");
    const patch = [
      "",
      MARKER,
      `import { patchStdout } from "${timerPath}";`,
      "patchStdout();",
      "// [cc-aws-keepalive:timer-end]",
      "",
    ].join("\n");

    lines.splice(insertIdx, 0, patch);
    writeFileSync(omcHud, lines.join("\n"));
    console.log("\n\nOMC HUD patched — AWS timer shows inline (e.g., aws:5h23m).");
    console.log("Note: if you update OMC, re-run this installer to re-apply the patch.");
  }
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
