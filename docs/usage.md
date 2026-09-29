# Usage

Once installed, cc-aws-keepalive runs on its own inside Claude Code. This is what you see and when.

## Before the credentials expire

1. You submit a prompt in Claude Code
2. The `UserPromptSubmit` hook checks credential expiration
3. If nearing expiry and `autoLoginCmd` is configured: fires it in the background (you get a notification, approve MFA, session renews silently)
4. If nearing expiry without `autoLoginCmd`: inline warning with re-auth command
5. If expired: warns inline — the prompt proceeds and `awsAuthRefresh` handles recovery

## After they expire

1. Claude Code hits a Bedrock 403
2. `awsAuthRefresh` runs — checks if you already re-authed in another terminal
3. If still expired and `autoLoginCmd` is configured, runs it synchronously (waits up to 3 minutes for password + MFA)
4. If re-authentication succeeded, `awsCredentialExport` reads the fresh creds from disk (bypassing the SDK memory cache)
5. Claude Code retries the API call and the session continues without a restart. If the credentials are still expired, re-authenticate in another terminal; Claude Code retries on your next message

## Status line timer

The optional `aws-statusline.mjs` shows a persistent countdown in the Claude Code status bar:

- Normal: `AWS: 4h23m`
- Warning (< `timerWarnMinutes`): yellow `AWS: 45m`
- Expired: red `AWS: EXPIRED`

**[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) users:** The installer creates an `aws-hud-wrapper.mjs` that intercepts OMC's HUD output and appends the timer inline (e.g., `aws:5h23m`). When `~/.claude/settings.json` exists and its `statusLine` command runs `omc-hud.mjs`, the installer points it at the wrapper; otherwise it prints the one line to change by hand. This approach survives OMC updates — the wrapper lives outside `omc-hud.mjs` and delegates to it.

For other status line plugins, set `statusLineCmd` in config.json to your existing command and point Claude Code's `statusLine.command` at `aws-statusline.mjs`; the timer is appended to your command's output. Both settings are needed.

## Several AWS accounts

Set `CC_KEEPALIVE_PROFILE` in a terminal before starting Claude Code to use a different profile there than the `profile` in `config.json` (see [Configuration](configuration.md)).
