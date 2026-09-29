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

Keep Claude Code sessions alive through AWS credential expiration. No more restarting terminal tabs every time your SSO/SAML session expires.

With AWS Bedrock, Claude Code's AWS SDK caches credentials in memory and never re-reads `~/.aws/credentials` after they expire ([known issue](https://github.com/anthropics/claude-code/issues/41064)). Four small Node.js scripts hook into Claude Code's credential lifecycle so it always reads fresh credentials from disk.

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

The installer creates a config and prints the settings to add to `~/.claude/settings.json`. You can also install it as a Claude Code plugin; see [Installation](docs/installation.md).

## Documentation

- [How it works](docs/how-it-works.md): the problem, the four scripts, and the proactive and reactive flows
- [Installation](docs/installation.md): plugin or manual install, upgrading, requirements, platform notes
- [Configuration](docs/configuration.md): `config.json` fields, `CC_KEEPALIVE_PROFILE`, credential providers, the status line timer, limitations
- [Auto-login setup](docs/auto-login.md): keychain storage, an `expect` template, common pitfalls, Windows
- [Credential sync](docs/credential-sync.md): SSH, webhook and command targets, and their security properties

## License

[GPL-3.0](LICENSE)
