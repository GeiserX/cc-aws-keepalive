#!/usr/bin/env node
// Cross-platform installer for cc-aws-keepalive
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// 2. Detect plugin vs manual install — true only when running from CC's plugin cache
// Use realpathSync to handle macOS /var → /private/var symlink resolution
const pluginCachePath = join(claudeConfigDir, "plugins", "cache");
const isPlugin = existsSync(pluginCachePath)
  ? realpathSync(scriptDir).startsWith(realpathSync(pluginCachePath))
  : false;

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
const MARKER_END = "// [cc-aws-keepalive:timer-end]";

if (hasOmc) {
  let hudContent = readFileSync(omcHud, "utf8");
  let isUpgrade = false;

  // Strip existing patch block if present (upgrade/repair)
  if (hudContent.includes(MARKER)) {
    isUpgrade = true;
    const hLines = hudContent.split("\n");
    const startIdx = hLines.findIndex(l => l.includes(MARKER));
    const endIdx = hLines.findIndex(l => l.includes(MARKER_END));
    if (startIdx !== -1 && endIdx !== -1) {
      let removeStart = startIdx;
      let removeEnd = endIdx;
      if (removeStart > 0 && hLines[removeStart - 1].trim() === "") removeStart--;
      if (removeEnd < hLines.length - 1 && hLines[removeEnd + 1].trim() === "") removeEnd++;
      hLines.splice(removeStart, removeEnd - removeStart + 1);
      hudContent = hLines.join("\n");
    }
  }

  // Insert fresh patch after the last import statement
  const hLines = hudContent.split("\n");
  let insertIdx = 0;
  for (let i = 0; i < hLines.length; i++) {
    if (hLines[i].trimStart().startsWith("import ")) {
      insertIdx = i + 1;
    }
  }

  const timerUrl = pathToFileURL(join(scriptDir, "omc-timer.mjs")).href;
  const patch = [
    "",
    MARKER,
    `import { patchStdout } from "${timerUrl}";`,
    "patchStdout();",
    MARKER_END,
    "",
  ].join("\n");

  hLines.splice(insertIdx, 0, patch);
  writeFileSync(omcHud, hLines.join("\n"));

  if (isUpgrade) {
    console.log("\n\nOMC HUD patch updated to current version.");
  } else {
    console.log("\n\nOMC HUD patched — AWS timer shows inline (e.g., aws:5h23m).");
  }
  console.log("Note: if you update OMC or this plugin, re-run the installer to re-apply.");
} else {
  console.log("\n\nOptional — show session timer in status bar:\n");
  console.log(JSON.stringify({
    statusLine: {
      type: "command",
      command: `node ${scriptDir}/aws-statusline.mjs`,
    },
  }, null, 2));
}

// 5. Auto-update settings.json credential paths on plugin version change
if (isPlugin && existsSync(settingsPath)) {
  try {
    const current = JSON.parse(readFileSync(settingsPath, "utf8"));
    let updated = false;
    for (const [key, script] of [
      ["awsCredentialExport", "aws-cred-export.mjs"],
      ["awsAuthRefresh", "aws-auth-refresh.mjs"],
    ]) {
      const val = current[key];
      if (typeof val === "string" && val.includes("cc-aws-keepalive") && !val.includes(scriptDir)) {
        current[key] = `node ${scriptDir}/${script}`;
        updated = true;
      }
    }
    if (updated) {
      writeFileSync(settingsPath, JSON.stringify(current, null, 2) + "\n");
      console.log("\nUpdated settings.json credential paths to current plugin version.");
    }
  } catch { /* settings.json parse failed — skip */ }
}

console.log("\nDone.");
