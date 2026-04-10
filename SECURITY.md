# Security Policy

## Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please use GitHub's private vulnerability reporting:

1. Go to https://github.com/GeiserX/cc-aws-keepalive/security/advisories
2. Click "Report a vulnerability"
3. Fill out the form with details

We will respond within **48 hours** and work with you to understand and address the issue.

### What to Include

- Type of issue (e.g., credential leakage, code injection via config)
- Full paths of affected source files
- Step-by-step instructions to reproduce
- Impact assessment and potential attack scenarios

### Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | Current release   |

Only the latest version receives security updates.

## Security Considerations

This project reads AWS credentials from `~/.aws/credentials` and outputs them as JSON for Claude Code's `awsCredentialExport` mechanism. The scripts:

- **Never log or cache credentials** — values are read and output in a single pass
- **Credential export** (`aws-cred-export.mjs`) is a local file read — no network calls
- **STS fallback**: when `expirationField` is not configured, `aws-auth-refresh.mjs` and `aws-cred-check.mjs` call `aws sts get-caller-identity` to verify credential validity. This makes a network call to AWS. Configure `expirationField` to avoid this
- **Status line** (`aws-statusline.mjs`) executes `statusLineCmd` from config if set — only configure this with commands you trust
- **Config file** (`~/.config/cc-aws-keepalive/config.json`) contains no secrets — only profile names and field references
- **Hook output** is displayed inline in Claude Code — never contains credential values

If you discover a path where credentials could be leaked, logged, or transmitted, please report it immediately.
