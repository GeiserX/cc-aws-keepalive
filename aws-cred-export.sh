#!/bin/bash
# Reads current AWS credentials from ~/.aws/credentials for the configured profile.
# Used by Claude Code's awsCredentialExport to bypass in-memory SDK cache.
# After re-authenticating in another terminal, CC picks up fresh creds via this script.
set -euo pipefail

CONFIG_FILE="${HOME}/.config/cc-aws-keepalive/config"
PROFILE="${CC_KEEPALIVE_PROFILE:-default}"

if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
fi

CREDS_FILE="${HOME}/.aws/credentials"

if [ ! -f "$CREDS_FILE" ]; then
    echo "credentials file not found: $CREDS_FILE" >&2
    exit 1
fi

get_val() {
    awk -v p="$PROFILE" -v k="$1" '
        $0 ~ "\\[" p "\\]" { found=1; next }
        /^\[/ { found=0 }
        found && $0 ~ k { sub(/^[^=]+=[ \t]*/, ""); print; exit }
    ' "$CREDS_FILE"
}

ACCESS_KEY=$(get_val aws_access_key_id)
SECRET_KEY=$(get_val aws_secret_access_key)
SESSION_TOKEN=$(get_val aws_session_token)

if [ -z "$ACCESS_KEY" ] || [ -z "$SECRET_KEY" ]; then
    echo "No credentials found for profile [$PROFILE]" >&2
    exit 1
fi

printf '{"Credentials":{"AccessKeyId":"%s","SecretAccessKey":"%s","SessionToken":"%s"}}\n' \
    "$ACCESS_KEY" "$SECRET_KEY" "$SESSION_TOKEN"
