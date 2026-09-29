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

What each script does as a session runs, before and after the credentials expire, is in [Usage](usage.md).

### The key insight

Claude Code's AWS SDK caches credentials in memory and doesn't re-read `~/.aws/credentials` after expiry ([known issue](https://github.com/anthropics/claude-code/issues/41064)). The `awsCredentialExport` setting forces Claude Code to call our script instead, which always reads the latest credentials from disk.
