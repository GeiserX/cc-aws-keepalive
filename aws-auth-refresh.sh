#!/bin/bash
# Called by Claude Code (awsAuthRefresh) when Bedrock auth fails.
# Checks if credentials were already refreshed in another terminal.
# Output is displayed to the user.

CONFIG_FILE="${HOME}/.config/cc-aws-keepalive/config"
PROFILE="${CC_KEEPALIVE_PROFILE:-default}"
EXPIRATION_FIELD=""
LOGIN_CMD="aws sso login --profile default"

if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
fi

CREDS_FILE="${HOME}/.aws/credentials"
NOW=$(date +%s)

# Try file-based expiration check first (instant, no network)
if [ -n "$EXPIRATION_FIELD" ]; then
    EXPIRATION=$(awk -v p="$PROFILE" -v k="$EXPIRATION_FIELD" '
        $0 ~ "\\[" p "\\]" { found=1; next }
        /^\[/ { found=0 }
        found && $0 ~ k { sub(/^[^=]+=[ \t]*/, ""); print; exit }
    ' "$CREDS_FILE")

    if [ -n "$EXPIRATION" ] && [ "$EXPIRATION" -gt "$NOW" ]; then
        MINS=$(( (EXPIRATION - NOW) / 60 ))
        echo "Credentials refreshed (valid for ${MINS}m). Retrying..."
        exit 0
    fi
else
    # Fall back to STS call (works with any credential provider)
    if aws sts get-caller-identity --profile "$PROFILE" &>/dev/null; then
        echo "Credentials valid. Retrying..."
        exit 0
    fi
fi

echo ""
echo "AWS credentials expired."
echo "Run in another terminal:  ${LOGIN_CMD}"
echo "Then come back here - CC will retry automatically on your next message."
echo ""
exit 1
