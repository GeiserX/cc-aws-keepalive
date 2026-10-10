# Getting started

Requires Node.js 18 or newer on your `PATH`. The native Claude Code install doesn't include Node.js, so install it separately if `node --version` fails.

## Option A: As a Claude Code plugin (recommended)

```bash
# Add the marketplace to your settings.json:
# "extraKnownMarketplaces": {
#   "cc-aws-keepalive": {
#     "source": { "source": "git", "url": "https://github.com/GeiserX/cc-aws-keepalive.git" }
#   }
# }
#
# Then enable the plugin:
# "enabledPlugins": { "cc-aws-keepalive@cc-aws-keepalive": true }
```

The plugin auto-registers the `UserPromptSubmit` hook. You still need to add `awsCredentialExport` and `awsAuthRefresh` to `~/.claude/settings.json` — point them at the cached plugin path:

```json
{
  "awsCredentialExport": "node ~/.claude/plugins/cache/cc-aws-keepalive/cc-aws-keepalive/<version>/aws-cred-export.mjs",
  "awsAuthRefresh": "node ~/.claude/plugins/cache/cc-aws-keepalive/cc-aws-keepalive/<version>/aws-auth-refresh.mjs"
}
```

Replace `<version>` with the installed version (e.g., `0.3.0`). Then create and edit your config:

```bash
cp config.example.json ~/.config/cc-aws-keepalive/config.json
```

## Option B: Manual (no plugin system)

```bash
git clone https://github.com/GeiserX/cc-aws-keepalive.git
cd cc-aws-keepalive
node install.mjs
```

The installer creates a config and prints all settings to add to `~/.claude/settings.json`.

## Upgrading

After upgrading, re-run the installer to update paths:

- **Plugin**: `node ~/.claude/plugins/cache/cc-aws-keepalive/cc-aws-keepalive/<version>/install.mjs`
- **Manual**: `git pull && node install.mjs`

The installer automatically:

1. **OMC HUD wrapper**: Cleans up any legacy timer patch from `omc-hud.mjs` and updates the `aws-hud-wrapper.mjs` with the current path
2. **settings.json paths**: Updates `awsCredentialExport` and `awsAuthRefresh` to point to the new version directory (preserves any custom wrapper commands)

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with `CLAUDE_CODE_USE_BEDROCK=1`
- Node.js 18 or newer on your `PATH` (the native Claude Code install doesn't include it)
- Any AWS credential provider that writes to `~/.aws/credentials`

## Platform notes

The core scripts (credential export, auth refresh, cred check, statusline) work on **macOS, Linux, and Windows**. The `autoLoginCmd` feature runs your command via the platform's native shell (`/bin/sh` on Unix, `cmd.exe` on Windows). On Windows, use a PowerShell script instead of `expect` — see [Windows alternative](auto-login.md#windows-alternative).
