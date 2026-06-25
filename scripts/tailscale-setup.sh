#!/bin/bash
# Tailscale + SFTP setup for Vixor ERP server
# Run as root or with sudo

echo "=== Step 1: Check Tailscale status ==="
tailscale status 2>/dev/null || echo "Tailscale not responding"

echo ""
echo "=== Step 2: Authorize (if not connected) ==="
# If not connected, run:
# tailscale up --accept-routes

echo ""
echo "=== Step 3: Get Tailscale IP ==="
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null)
echo "Tailscale IP: ${TAILSCALE_IP:-NOT CONNECTED}"

echo ""
echo "=== Step 4: Check SSH is running ==="
systemctl is-active sshd && echo "SSH: running" || echo "SSH: not running — start with: systemctl start sshd"

echo ""
echo "=== Step 5: Create SFTP user for file access ==="
# Creates a restricted sftp-only user 'vixorsftp'
if ! id vixorsftp &>/dev/null; then
  useradd -m -s /usr/sbin/nologin vixorsftp
  # Set home to uploads/outputs directory
  mkdir -p /opt/doc-capture/uploads
  chown vixorsftp:vixorsftp /opt/doc-capture/uploads
  echo "User vixorsftp created. Set password with: passwd vixorsftp"
else
  echo "User vixorsftp already exists"
fi

echo ""
echo "=== SFTP Connection Info ==="
echo "Host: ${TAILSCALE_IP:-<tailscale-ip>}"
echo "Port: 22"
echo "User: vixorsftp"
echo "Path: /opt/doc-capture/uploads"
echo ""
echo "FileZilla / Cyberduck / SFTP client settings:"
echo "  Protocol: SFTP"
echo "  Host: ${TAILSCALE_IP:-<tailscale-ip>}"
echo "  Port: 22"
echo "  Username: vixorsftp"
echo "  Password: (set with passwd vixorsftp)"
