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
4. `awsCredentialExport` reads fresh creds from disk (bypassing SDK memory cache)
5. Claude Code retries the API call — session continues without restart

## Status line timer

The optional `aws-statusline.mjs` shows a persistent countdown in the Claude Code status bar:

- Normal: `AWS: 4h23m`
- Warning (< `timerWarnMinutes`): yellow `AWS: 45m`
- Expired: red `AWS: EXPIRED`

**[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) users:** The installer creates an `aws-hud-wrapper.mjs` that intercepts OMC's HUD output and appends the timer inline (e.g., `aws:5h23m`). It automatically updates the `statusLine` setting to use the wrapper. This approach survives OMC updates — the wrapper lives outside `omc-hud.mjs` and delegates to it.

For other status line plugins, set `statusLineCmd` in config.json to your existing command — the timer will be appended.

## Several AWS accounts

Set `CC_KEEPALIVE_PROFILE` in a terminal before starting Claude Code to use a different profile there than the `profile` in `config.json` (see [Configuration](configuration.md)).
