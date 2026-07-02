#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRISP_DIR="$HOME/.crisp"
SERVICES_DIR="$HOME/Library/Services"
WORKFLOW="Crisp Rewrite.workflow"

# Install Python service script
mkdir -p "$CRISP_DIR"
cp "$SCRIPT_DIR/crisp_service.py" "$CRISP_DIR/service.py"
chmod +x "$CRISP_DIR/service.py"
echo "✓ $CRISP_DIR/service.py"

# Install Automator workflow
mkdir -p "$SERVICES_DIR"
rm -rf "$SERVICES_DIR/$WORKFLOW"
cp -r "$PROJECT_DIR/$WORKFLOW" "$SERVICES_DIR/"
echo "✓ $SERVICES_DIR/$WORKFLOW"

# Ask macOS to reload services
/System/Library/CoreServices/pbs -flush 2>/dev/null || true
echo "✓ Services menu refreshed"

echo ""
echo "Next steps:"
echo "  1. System Settings → Keyboard → Keyboard Shortcuts → Services → Text"
echo "     Find 'Crisp Rewrite' and assign a shortcut (e.g. ⌘⇧R)"
echo "  2. npm run dev"
echo "  3. Select any text → use your shortcut (or right-click → Services → Crisp Rewrite)"
