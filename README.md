<p align="center">
  <img src="docs/images/banner.svg" alt="cc-aws-keepalive banner" width="900"/>
</p>

# cc-aws-keepalive

Keep Claude Code sessions alive through AWS credential expiration. No more restarting terminal tabs every time your SSO/SAML session expires.

## Problem

When using Claude Code with AWS Bedrock, the AWS SDK caches credentials in memory. After your SSO/SAML session expires (typically every 1-12 hours), all Claude Code sessions become unresponsive and must be restarted — often corrupting conversations and losing context.

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
3. If nearing expiry and `autoLoginCmd` is configured: fires it in the background (you get a notification, approve MFA, session renews silently)
4. If nearing expiry without `autoLoginCmd`: inline warning with re-auth command
5. If expired: warns inline — the prompt proceeds and `awsAuthRefresh` handles recovery

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

## Configure

Edit `~/.config/cc-aws-keepalive/config.json`:

```json
{
  "profile": "my-bedrock-profile",
  "expirationField": "x_security_token_expires",
  "loginCmd": "saml2aws login --profile my-bedrock-profile",
  "autoLoginCmd": "",
  "autoLoginMinutes": 30,
  "warnMinutes": 30,
  "timerWarnMinutes": 60,
  "statusLineCmd": ""
}
```

| Field | Description |
|-------|-------------|
| `profile` | AWS profile name in `~/.aws/credentials` |
| `expirationField` | Field storing session expiration as unix timestamp. Leave empty to fall back to `aws sts get-caller-identity` (slower, can only detect expired vs. valid — not time remaining) |
| `loginCmd` | Command to re-authenticate (shown in warnings so you can copy-paste it) |
| `autoLoginCmd` | Command for fully automated re-authentication. Must work without a TTY — see [Auto-login setup](#auto-login-setup) below |
| `autoLoginMinutes` | Auto-run `autoLoginCmd` when session has fewer than this many minutes left (0 = disabled). Requires `expirationField`. Rate-limited to once per 5 minutes |
| `warnMinutes` | Minutes before expiry to start showing warnings |
| `timerWarnMinutes` | Minutes before expiry to turn the statusline timer red |
| `statusLineCmd` | Existing status line command to compose with (leave empty for standalone) |

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `CC_KEEPALIVE_PROFILE` | Overrides `profile` from config. Useful for multi-account setups where different terminals use different AWS accounts |

**Common `expirationField` values by provider:**

| Provider | `expirationField` value |
|----------|------------------------|
| saml2aws | `x_security_token_expires` |
| gimme-aws-creds | `x_security_token_expires` |
| awsmyid | `awsmyid_session_expiration` |
| aws-google-auth | `x_security_token_expires` |

Check your `~/.aws/credentials` after authenticating to find the field name for your provider.

## Auto-login setup

The `autoLoginCmd` feature lets cc-aws-keepalive re-authenticate automatically — no manual terminal switching needed. This section walks through setting it up end-to-end.

### How it triggers

- **Proactive** (before expiry): When you submit a prompt and your session has fewer than `autoLoginMinutes` left, the command fires **in the background**. You keep working while it runs. Rate-limited to once per 5 minutes to avoid spamming.
- **Reactive** (after expiry): When Claude Code hits a Bedrock 403, the command runs **synchronously** with up to 3 minutes for completion. Since you're blocked waiting for credentials anyway, this is fine.

### Requirements

Your `autoLoginCmd` must:

1. **Run without a TTY** — Claude Code hooks have no terminal attached. Interactive prompts hang forever.
2. **Handle password input** — pull it from a keychain/vault, not stdin.
3. **Handle MFA** — either trigger a push notification you approve on your phone, or use a TOTP generator.
4. **Suppress spinner/progress output** — ANSI escape codes from progress bars break pattern matching in expect scripts. Most CLI tools have a `--no-progress` or `--spinner=false` flag.
5. **Pre-select the IAM role** — if your tool shows an interactive role chooser, use a CLI flag to filter or pre-select the role. Otherwise, characters from the password prompt can spill into the role selector.

### Step 1: Store your password securely

Never put passwords in config files or environment variables. Use your OS keychain.

**macOS** (Keychain):
```bash
security add-generic-password -s cc-aws-keepalive -a mylogin -w 'YourPassword123!'
# Verify it works:
security find-generic-password -s cc-aws-keepalive -a mylogin -w
```

**Linux** (libsecret / GNOME Keyring):
```bash
secret-tool store --label="cc-aws-keepalive" service cc-aws-keepalive account mylogin <<< 'YourPassword123!'
# Verify:
secret-tool lookup service cc-aws-keepalive account mylogin
```

**Windows** (Credential Manager via PowerShell):
```powershell
# Store
cmdkey /add:cc-aws-keepalive /user:mylogin /pass:YourPassword123!
# Retrieve (in your automation script)
(New-Object System.Net.NetworkCredential((cmdkey /list:cc-aws-keepalive))).Password
```

Replace `mylogin` with a label that identifies your credential provider account (e.g., `saml2aws`, `awsmyid`).

### Step 2: Write an expect script

[`expect`](https://core.tcl-lang.org/expect/index) drives interactive CLI tools by matching output patterns and sending responses. Install it with `brew install expect` (macOS) or `apt install expect` (Linux).

Here's a template — adapt it to your login tool:

```expect
#!/usr/bin/env expect
# Auto-login script for cc-aws-keepalive
# Adapt the spawn command, password retrieval, and success pattern to your tool.

set timeout 180
log_user 0
set notified 0

# --- Password retrieval ---
# macOS Keychain:
set password [exec security find-generic-password -s cc-aws-keepalive -a mylogin -w]
# Linux libsecret:
# set password [exec secret-tool lookup service cc-aws-keepalive account mylogin]

# --- CLI arguments (optional, for flexibility) ---
set profile [lindex $argv 0]
if {$profile eq ""} { set profile "default" }

# --- Spawn your login tool ---
# Key flags:
#   --spinner=false / --no-progress : suppress ANSI output that breaks expect
#   -r / --role-filter              : skip interactive role chooser
#   -f push / --mfa-mode push       : use push MFA instead of TOTP prompt
#
# Examples:
#   saml2aws:  spawn saml2aws login --profile $profile --skip-prompt --disable-keychain
#   awsmyid:   spawn awsmyid login -p $profile -r bedrock -f push --spinner=false
#   gimme:     spawn gimme-aws-creds --profile $profile
spawn your-login-tool login --profile $profile --spinner=false

expect {
    -re {[Pp]assword} {
        sleep 0.5
        send -- "$password\r"
        exp_continue
    }
    -re {MFA Number:\s*(\d+)} {
        # Okta number matching challenge — show the code in a desktop notification
        # Guard: only notify once per login (tools may retry and output multiple numbers)
        if {!$notified} {
            set notified 1
            set mfa_number $expect_out(1,string)
            # macOS:
            exec osascript -e "display notification \"Enter $mfa_number on your phone\" with title \"AWS MFA\" subtitle \"Number: $mfa_number\" sound name \"Ping\""
            # Linux alternative (requires notify-send):
            # exec notify-send "AWS MFA" "Enter $mfa_number on your phone"
        }
        exp_continue
    }
    -re {push notification|Okta Verify|Waiting.*approval|verify.*identity|Please Approve} {
        # Simple push MFA (no number) — just remind to approve
        if {!$notified} {
            set notified 1
            # macOS:
            exec osascript -e {display notification "Check your authenticator app" with title "AWS Login" subtitle "MFA push sent" sound name "Ping"}
            # Linux alternative:
            # exec notify-send "AWS Login" "MFA push sent — check your authenticator app"
        }
        exp_continue
    }
    -re {hoose.*role|Select.*role} {
        # Fallback if role filter didn't work — accept first match
        send "\r"
        exp_continue
    }
    -re {Credentials will expire|Success|Logged in} {
        puts "Auto-login succeeded"
    }
    eof {}
    timeout {
        puts stderr "auto-login timed out after 180s"
        exit 1
    }
}

set result [wait]
exit [lindex $result 3]
```

Save it to `~/.config/cc-aws-keepalive/auto-login.exp` and make it executable:

```bash
chmod +x ~/.config/cc-aws-keepalive/auto-login.exp
```

**Test it manually first:**

```bash
# This should complete the full login without any manual input
expect ~/.config/cc-aws-keepalive/auto-login.exp my-profile
```

If it hangs, run with `log_user 1` (change line 4) to see what the tool is outputting — often it's an unexpected prompt or ANSI escape codes breaking the pattern match.

### Step 3: Configure cc-aws-keepalive

Update your `~/.config/cc-aws-keepalive/config.json`:

```json
{
  "profile": "my-bedrock-profile",
  "expirationField": "x_security_token_expires",
  "loginCmd": "saml2aws login --profile my-bedrock-profile",
  "autoLoginCmd": "expect ~/.config/cc-aws-keepalive/auto-login.exp my-bedrock-profile",
  "autoLoginMinutes": 30,
  "warnMinutes": 30,
  "timerWarnMinutes": 60,
  "statusLineCmd": ""
}
```

Key points:
- `autoLoginCmd` is the full command — it must work when run as `sh -c "your command"` with no TTY
- `autoLoginMinutes` controls how early the proactive trigger fires (30 = re-auth when 30 minutes remain)
- `loginCmd` is still shown in manual warnings as a fallback — it's never run automatically

### Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Script hangs at password prompt | ANSI spinner output breaks the `Password` pattern match | Add `--spinner=false` or `--no-progress` to your spawn command |
| Wrong IAM role selected | Password characters leak into interactive role chooser | Use a role filter flag (`-r`, `--role`, `--role-filter`) to pre-select |
| Password not found | Keychain service/account name mismatch | Run the `security find-generic-password` command manually to verify |
| Times out after 180s | MFA push not approved, or success pattern doesn't match | Set `log_user 1` and run manually to see what the tool outputs after login |
| MFA number not showing | Number matching pattern doesn't match your tool's output | Set `log_user 1`, run manually, and look for the line containing the number. Update the `-re {MFA Number:\s*(\d+)}` pattern to match |
| `spawn: command not found` | `expect` not installed | `brew install expect` (macOS) or `apt install expect` (Linux) |
| Works manually but not from cc-aws-keepalive | PATH differs when run from Claude Code | Use full path to your login tool in the spawn command (e.g., `/usr/local/bin/saml2aws`) |

### Windows alternative

Windows doesn't have `expect`. Use a PowerShell script instead:

```powershell
# auto-login.ps1
$password = (cmdkey /list:cc-aws-keepalive | Select-String "Password").ToString().Split("=")[1].Trim()
echo $password | your-login-tool login --profile $args[0] --stdin-password
```

Set `autoLoginCmd` to: `powershell -File %USERPROFILE%\.config\cc-aws-keepalive\auto-login.ps1 my-profile`

## Status line timer

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

## Platform notes

The core scripts (credential export, auth refresh, cred check, statusline) work on **macOS, Linux, and Windows**. The `autoLoginCmd` feature runs your command via the platform's native shell (`/bin/sh` on Unix, `cmd.exe` on Windows). On Windows, use a PowerShell script instead of `expect` — see [Windows alternative](#windows-alternative).

## Limitations

- **Proactive time-remaining warnings** require `expirationField`. Without it, the STS fallback can only detect valid vs. expired — not "expires in 20 minutes".
- **Fully automated re-authentication** requires an `autoLoginCmd` that can drive your login tool non-interactively. See [Auto-login setup](#auto-login-setup) for a complete walkthrough.

## License

[GPL-3.0](LICENSE)
