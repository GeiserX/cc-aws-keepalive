<p align="center">
  <img src="docs/images/banner.svg" alt="cc-aws-keepalive banner" width="900"/>
</p>

<p align="center">
  <a href="https://github.com/GeiserX/cc-aws-keepalive/releases"><img src="https://img.shields.io/github/v/release/GeiserX/cc-aws-keepalive?style=flat-square" alt="Release"></a>
  <a href="https://github.com/GeiserX/cc-aws-keepalive/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/GeiserX/cc-aws-keepalive/ci.yml?style=flat-square&logo=github&label=CI" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GeiserX/cc-aws-keepalive?style=flat-square" alt="License"></a>
  <a href="https://codecov.io/gh/GeiserX/cc-aws-keepalive"><img src="https://codecov.io/gh/GeiserX/cc-aws-keepalive/graph/badge.svg" alt="codecov"></a>
</p>

# cc-aws-keepalive

Keep Claude Code sessions alive through AWS credential expiration: four small Node.js command-line scripts, wired into Claude Code's credential, hook and status line settings, make it re-read `~/.aws/credentials` instead of making you restart the tab when your SSO or SAML session expires.

With AWS Bedrock, Claude Code's AWS SDK caches credentials in memory and never re-reads `~/.aws/credentials` after they expire ([known issue](https://github.com/anthropics/claude-code/issues/41064)).

## Features

- `aws-cred-export.mjs` reads fresh credentials from `~/.aws/credentials`, bypassing the SDK cache (`awsCredentialExport`).
- `aws-auth-refresh.mjs` recovers from a Bedrock 403, noticing if you already re-authenticated in another terminal (`awsAuthRefresh`).
- `aws-cred-check.mjs` warns before each prompt when credentials are expired or close to expiry (`hooks.UserPromptSubmit`).
- `aws-statusline.mjs` shows an optional countdown in the status bar, e.g. `AWS: 4h23m` (`statusLine`).
- Optional automatic re-login through your own `autoLoginCmd`, with keychain passwords and push MFA.
- Optional credential sync to other machines over SSH, an HTTPS webhook or a command.
- Works with saml2aws, gimme-aws-creds, aws-google-auth and any tool that writes to `~/.aws/credentials`.
- macOS, Linux and Windows.

## Quick start

```bash
git clone https://github.com/GeiserX/cc-aws-keepalive.git
cd cc-aws-keepalive
node install.mjs
```

Needs Node 18 or newer and a `~/.aws/credentials` file. The installer creates a config and prints the settings to add to `~/.claude/settings.json`; to install it as a Claude Code plugin instead, see [Getting started](docs/getting-started.md).

## Documentation

- [Getting started](docs/getting-started.md): plugin or manual install, upgrading, requirements, platform notes
- [Configuration](docs/configuration.md): `config.json` fields, `CC_KEEPALIVE_PROFILE`, credential providers, limitations
- [Usage](docs/usage.md): the warnings before each prompt, the recovery after a Bedrock 403, the status line timer
- [How it works](docs/how-it-works.md): the problem, the four scripts, and why re-reading from disk fixes it
- [Auto-login setup](docs/auto-login.md): keychain storage, an `expect` template, common pitfalls, Windows
- [Credential sync](docs/credential-sync.md): SSH, webhook and command targets, and their security properties

## License

[GPL-3.0-or-later](LICENSE)
