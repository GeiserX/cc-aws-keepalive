#!/bin/bash
# Install cc-aws-keepalive scripts and create default config
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${HOME}/.local/bin"
CONFIG_DIR="${HOME}/.config/cc-aws-keepalive"
CONFIG_FILE="${CONFIG_DIR}/config"

echo "Installing scripts to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/aws-cred-export.sh" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/aws-auth-refresh.sh" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/aws-cred-check.sh" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/aws-cred-export.sh" "$INSTALL_DIR/aws-auth-refresh.sh" "$INSTALL_DIR/aws-cred-check.sh"
echo "Scripts installed to ${INSTALL_DIR}."

# Create config if it doesn't exist
if [ ! -f "$CONFIG_FILE" ]; then
    mkdir -p "$CONFIG_DIR"
    cp "$SCRIPT_DIR/config.example" "$CONFIG_FILE"
    echo ""
    echo "Config created at ${CONFIG_FILE}"
    echo "Edit it to set your AWS profile, expiration field, and login command."
else
    echo "Config already exists at ${CONFIG_FILE} (not overwritten)."
fi

echo ""
echo "Add the following to your ~/.claude/settings.json:"
echo ""
cat <<EOF
  "awsCredentialExport": "${INSTALL_DIR}/aws-cred-export.sh",
  "awsAuthRefresh": "${INSTALL_DIR}/aws-auth-refresh.sh",
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "${INSTALL_DIR}/aws-cred-check.sh"
          }
        ]
      }
    ]
  },
EOF
echo ""
echo "Done."
