#!/bin/bash
# UserPromptSubmit hook: proactive AWS credential expiry check.
# Blocks prompt if expired, warns via stderr if nearing expiry.

CONFIG_FILE="${HOME}/.config/cc-aws-keepalive/config"
PROFILE="${CC_KEEPALIVE_PROFILE:-default}"
EXPIRATION_FIELD=""
LOGIN_CMD="aws sso login --profile default"
WARN_MINUTES=30

if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
fi

CREDS_FILE="${HOME}/.aws/credentials"
NOW=$(date +%s)
REMAINING=""

# Determine remaining time
if [ -n "$EXPIRATION_FIELD" ]; then
    # Fast path: read expiration timestamp from credentials file (no network call)
    EXPIRATION=$(awk -v p="$PROFILE" -v k="$EXPIRATION_FIELD" '
        $0 ~ "\\[" p "\\]" { found=1; next }
        /^\[/ { found=0 }
        found && $0 ~ k { sub(/^[^=]+=[ \t]*/, ""); print; exit }
    ' "$CREDS_FILE")

    if [ -z "$EXPIRATION" ]; then
        exit 0  # Can't determine expiry, let it through
    fi
    REMAINING=$((EXPIRATION - NOW))
else
    # Slow path: test credentials via STS call
    if ! aws sts get-caller-identity --profile "$PROFILE" &>/dev/null; then
        REMAINING=-1
    else
        exit 0  # Creds valid, can't determine remaining time without expiration field
    fi
fi

WARN_SECONDS=$((WARN_MINUTES * 60))

# Escape LOGIN_CMD for safe JSON embedding
ESCAPED_CMD=$(printf '%s' "$LOGIN_CMD" | sed 's/\\/\\\\/g; s/"/\\"/g')

if [ "$REMAINING" -le 0 ]; then
    # Expired — block the prompt (reason must be valid JSON: use literal \n not newline chars)
    printf '{"decision":"block","reason":"AWS credentials EXPIRED. Run in another terminal:  %s  — then come back and retry your message."}\n' "$ESCAPED_CMD"
    exit 0
elif [ "$REMAINING" -le "$WARN_SECONDS" ]; then
    MINS=$((REMAINING / 60))
    # Warn but don't block — stderr is shown inline in CC
    echo "AWS session expires in ${MINS}m. Run soon: ${LOGIN_CMD}" >&2
fi

exit 0
