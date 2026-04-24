<p align="center">
  <img src="docs/images/banner.svg" alt="cc-aws-keepalive banner" width="900"/>
</p>

# cc-aws-keepalive

Keep Claude Code sessions alive through AWS credential expiration. No more restarting terminal tabs every time your SSO/SAML session expires.

## Problem

When using Claude Code with AWS Bedrock, the AWS SDK caches credentials in memory. After your SSO/SAML session expires (typically every 8-12 hours), all Claude Code sessions become unresponsive and must be restarted — often corrupting conversations and losing context.

## Solution

Four Node.js scripts (cross-platform: macOS, Linux, Windows) that hook into Claude Code's credential lifecycle:

| Script | Purpose | CC Setting |
|--------|---------|------------|
| `aws-cred-export.mjs` | Reads fresh creds from `~/.aws/credentials`, bypassing SDK in-memory cache | `awsCredentialExport` |
| `aws-auth-refresh.mjs` | On auth failure, checks if you already re-authed in another terminal | `awsAuthRefresh` |
| `aws-cred-check.mjs` | Proactive check before each prompt — warns if expired or nearing expiry | `hooks.UserPromptSubmit` |
| `aws-statusline.mjs` | Optional persistent timer in the status bar (e.g., `AWS: 4h23m`) | `statusLine` |

### How it works

**Before expiry (proactive):**

1. You submit a prompt in Claude Code
2. The `UserPromptSubmit` hook checks credential expiration
3. If nearing expiry: inline warning with re-auth instructions
4. If expired: warns inline — the prompt proceeds and `awsAuthRefresh` handles recovery

**After expiry (reactive):**

1. Claude Code hits a Bedrock 403
2. `awsAuthRefresh` runs — checks if you already re-authed in another terminal
3. If still expired and `autoLoginCmd` is configured, runs it synchronously (waits up to 3 minutes for password + MFA)
4. `awsCredentialExport` reads fresh creds from disk (bypassing SDK memory cache)
5. Claude Code retries the API call — session continues without restart

### The key insight

Claude Code's AWS SDK caches credentials in memory and doesn't re-read `~/.aws/credentials` after expiry ([known issue](https://github.com/anthropics/claude-code/issues/41064)). The `awsCredentialExport` setting forces Claude Code to call our script instead, which always reads the latest credentials from disk.

## Install

Requires Node.js (ships with Claude Code).

### Option A: As a Claude Code plugin (recommended)

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

### Option B: Manual (no plugin system)

```bash
git clone https://github.com/GeiserX/cc-aws-keepalive.git
cd cc-aws-keepalive
node install.mjs
```

The installer creates a config and prints all settings to add to `~/.claude/settings.json`.

### Upgrading

After upgrading, re-run the installer to update paths:

- **Plugin**: `node ~/.claude/plugins/cache/cc-aws-keepalive/cc-aws-keepalive/<version>/install.mjs`
- **Manual**: `git pull && node install.mjs`

The installer automatically:

1. **OMC HUD wrapper**: Cleans up any legacy timer patch from `omc-hud.mjs` and updates the `aws-hud-wrapper.mjs` with the current path
2. **settings.json paths**: Updates `awsCredentialExport` and `awsAuthRefresh` to point to the new version directory (preserves any custom wrapper commands)

### Configure

Edit `~/.config/cc-aws-keepalive/config.json`:

```json
{
  "profile": "my-bedrock-profile",
  "expirationField": "x_security_token_expires",
  "loginCmd": "saml2aws login --profile my-bedrock-profile",
  "autoLoginCmd": "",
  "autoLoginMinutes": 120,
  "warnMinutes": 30,
  "timerWarnMinutes": 60,
  "statusLineCmd": ""
}
```

| Field | Description |
|-------|-------------|
| `profile` | AWS profile name in `~/.aws/credentials` |
| `expirationField` | Field storing session expiration as unix timestamp. Leave empty to fall back to `aws sts get-caller-identity` (slower) |
| `loginCmd` | Command to re-authenticate (shown in warnings) |
| `autoLoginCmd` | Command for automated non-interactive re-authentication (e.g., an `expect` script). Must handle password/MFA without a TTY. |
| `autoLoginMinutes` | Auto-run `autoLoginCmd` when session has fewer than this many minutes left (0 = disabled). Requires `expirationField`. Rate-limited to once per 5 minutes. |
| `warnMinutes` | Minutes before expiry to start warning in the hook |
| `timerWarnMinutes` | Minutes before expiry to turn the statusline timer red |
| `statusLineCmd` | Existing status line command to compose with (leave empty for standalone) |

### Status line timer

The optional `aws-statusline.mjs` shows a persistent countdown in the Claude Code status bar:

- Normal: `AWS: 4h23m`
- Warning (< `timerWarnMinutes`): yellow `AWS: 45m`
- Expired: red `AWS: EXPIRED`

**[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) users:** The installer creates an `aws-hud-wrapper.mjs` that intercepts OMC's HUD output and appends the timer inline (e.g., `aws:5h23m`). It automatically updates the `statusLine` setting to use the wrapper. This approach survives OMC updates — the wrapper lives outside `omc-hud.mjs` and delegates to it.

For other status line plugins, set `statusLineCmd` in config.json to your existing command — the timer will be appended.

## Credential providers

Works with any tool that **materializes temporary credentials** (`aws_access_key_id`, `aws_secret_access_key`, `aws_session_token`) into `~/.aws/credentials`:

- **saml2aws**
- **gimme-aws-creds** (Okta)
- **aws-google-auth**
- **onelogin-aws-cli**
- Any corporate SAML/OIDC CLI that writes to `~/.aws/credentials`

> **Note:** Plain `aws sso login` stores tokens in `~/.aws/sso/cache/`, not in `~/.aws/credentials`. If you use AWS SSO, you need a tool that exports the session to the credentials file, or use `aws configure export-credentials --profile myprofile --format process`.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with `CLAUDE_CODE_USE_BEDROCK=1`
- Node.js (ships with Claude Code)
- Any AWS credential provider that writes to `~/.aws/credentials`

## Limitations

- **Proactive time-remaining warnings** require `expirationField`. Without it, the STS fallback can only detect valid vs. expired — not "expires in 20 minutes".
- **Fully automated re-authentication** requires an `autoLoginCmd` that can drive your login tool non-interactively (e.g., via `expect` with passwords in your OS keychain). If your login requires interactive MFA that cannot be automated, the script will send a desktop notification — you approve on your phone, and the session resumes.

## License

[GPL-3.0](LICENSE)
