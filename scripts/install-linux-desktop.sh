#!/bin/bash
# Installs Vixor ERP Flutter Desktop to system with taskbar icon
set -e

APP_DIR="${HOME}/apps/vixor-flutter"
ICON_DIR="${HOME}/.local/share/icons/hicolor"
DESKTOP_DIR="${HOME}/.local/share/applications"

echo "Installing Vixor ERP desktop entry..."

# Create directories
mkdir -p "$ICON_DIR/256x256/apps"
mkdir -p "$DESKTOP_DIR"

# Copy icon (from app bundle data directory)
ICON_SRC=$(find "$APP_DIR" -name "app_icon.png" 2>/dev/null | head -1)
if [ -n "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$ICON_DIR/256x256/apps/vixor-erp.png"
  gtk-update-icon-cache -f -t "$ICON_DIR" 2>/dev/null || true
fi

# Create .desktop file
cat > "$DESKTOP_DIR/vixor-erp.desktop" << DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Vixor ERP
GenericName=Field Service Management
Comment=Vixor ERP — Field Service Management Platform
Exec=${APP_DIR}/vixor_erp
Icon=vixor-erp
Terminal=false
Categories=Office;ProjectManagement;
Keywords=vixor;erp;crm;field;service;
StartupWMClass=vixor_erp
StartupNotify=true
DESKTOP

chmod +x "$DESKTOP_DIR/vixor-erp.desktop"

# Make binary executable
chmod +x "$APP_DIR/vixor_erp" 2>/dev/null || true

echo "✅ Vixor ERP installed to taskbar!"
echo "You may need to log out and back in for the icon to appear."
echo ""
echo "Launch: ${APP_DIR}/vixor_erp"
