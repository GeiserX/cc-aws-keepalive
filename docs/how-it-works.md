# How it works

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
