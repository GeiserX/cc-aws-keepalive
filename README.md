# cc-aws-keepalive

Keep Claude Code sessions alive through AWS credential expiration. No more restarting 10 terminal tabs every time your SSO/SAML session expires.

## Problem

When using Claude Code with AWS Bedrock, the AWS SDK caches credentials in memory. After your SSO/SAML session expires (typically every 8-12 hours), all Claude Code sessions become unresponsive and must be restarted, often corrupting conversations and losing context.

## Solution

Three lightweight bash scripts that hook into Claude Code's credential lifecycle:

| Script | Purpose | CC Setting |
|--------|---------|------------|
| `aws-cred-export.sh` | Reads fresh creds from `~/.aws/credentials` on every auth attempt, bypassing SDK in-memory cache | `awsCredentialExport` |
| `aws-auth-refresh.sh` | On auth failure, checks if you already re-authed in another terminal. Shows instructions if not | `awsAuthRefresh` |
| `aws-cred-check.sh` | Proactive check before each prompt. Blocks if expired, warns if nearing expiry (+ macOS notification) | `hooks.UserPromptSubmit` |

### How it works

**Before expiry (proactive):**

1. You submit a prompt in Claude Code
2. `aws-cred-check.sh` hook fires, checks credential expiration
3. If < 30 min left: stderr warning + macOS notification
4. If expired: blocks the prompt with re-auth instructions

**After expiry (reactive):**

1. Claude Code hits a Bedrock 403
2. `awsAuthRefresh` runs — checks if you already re-authed in another terminal
3. `awsCredentialExport` reads fresh creds from the file (bypassing SDK memory cache)
4. Claude Code retries the API call — session continues without restart

### The key insight

Claude Code's AWS SDK caches credentials in memory and doesn't re-read `~/.aws/credentials` after expiry ([known issue](https://github.com/anthropics/claude-code/issues/41064)). The `awsCredentialExport` setting forces Claude Code to call our script instead, which always reads fresh credentials from disk.

## Install

```bash
git clone https://github.com/GeiserX/cc-aws-keepalive.git
cd cc-aws-keepalive
./install.sh
```

This installs the scripts to `~/.local/bin/` and creates a config at `~/.config/cc-aws-keepalive/config`.

### Configure your profile

Edit `~/.config/cc-aws-keepalive/config`:

```bash
# Your AWS profile name in ~/.aws/credentials
PROFILE=my-bedrock-profile

# Field in ~/.aws/credentials that stores session expiration as unix timestamp.
# Leave empty to fall back to `aws sts get-caller-identity` (slower but universal).
# Common values:
#   awsmyid_session_expiration   (awsmyid)
#   x_security_token_expires     (some SAML tools)
EXPIRATION_FIELD=awsmyid_session_expiration

# Command shown to user when creds expire (your SSO/SAML login command)
LOGIN_CMD="awsmyid login -p my-bedrock-profile"

# Minutes before expiry to start warning
WARN_MINUTES=30
```

### Add to Claude Code settings

Add these keys to your `~/.claude/settings.json`:

```json
{
  "awsCredentialExport": "~/.local/bin/aws-cred-export.sh",
  "awsAuthRefresh": "~/.local/bin/aws-auth-refresh.sh",
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/bin/aws-cred-check.sh"
          }
        ]
      }
    ]
  }
}
```

## Credential providers

Works with any tool that writes temporary credentials to `~/.aws/credentials`:

- **AWS SSO** (`aws sso login`)
- **awsmyid** (Disney MyID SAML)
- **saml2aws**
- **aws-google-auth**
- **onelogin-aws-cli**
- **gimme-aws-creds** (Okta)
- Any custom SAML/OIDC tool

If your tool doesn't write an expiration timestamp field, leave `EXPIRATION_FIELD` empty. The scripts will fall back to testing credentials via `aws sts get-caller-identity` (adds ~1s latency per prompt).

## Requirements

- Claude Code with `CLAUDE_CODE_USE_BEDROCK=1`
- Any AWS credential provider that writes to `~/.aws/credentials`
- macOS for desktop notifications (optional, gracefully skipped on Linux)

## How is this different from just running `aws sso login`?

The problem isn't re-authenticating — it's that **Claude Code sessions don't pick up new credentials** after you re-authenticate. Even after refreshing `~/.aws/credentials`, existing CC sessions keep using stale cached credentials from memory. This project fixes that by making CC re-read from disk via `awsCredentialExport`.

## License

[GPL-3.0](LICENSE)
