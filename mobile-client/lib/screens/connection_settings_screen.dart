import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/settings_service.dart';
import '../store/app_state.dart';
import 'connection_diagnostics_screen.dart';
import 'login_screen.dart';

/// Lets the user point the app at a different server without rebuilding:
/// either a plain address (LAN IP, or a Cloudflare Quick Tunnel URL —
/// anything reachable directly) or an address sitting behind Cloudflare
/// Access, using a Service Token rather than an interactive email login
/// (see the long comment in settings_service.dart for why — short version:
/// Cloudflare's own HttpOnly/anti-replay cookie protections make a
/// WebView-based email+OTP flow unreliable for a native API client, and
/// a Service Token is what Cloudflare documents for exactly this case).
class ConnectionSettingsScreen extends StatefulWidget {
  const ConnectionSettingsScreen({super.key});

  @override
  State<ConnectionSettingsScreen> createState() => _ConnectionSettingsScreenState();
}

class _ConnectionSettingsScreenState extends State<ConnectionSettingsScreen> {
  final _addressController = TextEditingController();
  final _clientIdController = TextEditingController();
  final _clientSecretController = TextEditingController();
  ConnectionMode _mode = ConnectionMode.direct;
  bool _loading = true;
  bool _saving = false;
  bool _secretVisible = false;
  String? _importError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final appState = context.read<AppState>();
    final config = appState.connectionConfig;
    _mode = config.mode;
    _addressController.text = config.address;
    if (config.mode == ConnectionMode.cloud) {
      final (id, secret) = await appState.getCfServiceToken();
      _clientIdController.text = id ?? '';
      _clientSecretController.text = secret ?? '';
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _importFromFile() async {
    setState(() => _importError = null);
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json'],
    );
    final path = result?.files.single.path;
    if (path == null) return; // user cancelled the picker

    try {
      final raw = await File(path).readAsString();
      final data = jsonDecode(raw);
      if (data is! Map) throw const FormatException('not an object');

      final modeStr = data['mode'] as String?;
      final mode = modeStr == ConnectionMode.cloud.name ? ConnectionMode.cloud : ConnectionMode.direct;
      final address = data['address'] as String?;
      if (address == null || address.trim().isEmpty) {
        throw const FormatException('missing "address"');
      }

      setState(() {
        _mode = mode;
        _addressController.text = address.trim();
        if (mode == ConnectionMode.cloud) {
          _clientIdController.text = (data['clientId'] as String?)?.trim() ?? '';
          _clientSecretController.text = (data['clientSecret'] as String?)?.trim() ?? '';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _importError = AppLocalizations.of(context)!.connectionImportError);
    }
  }

  Future<void> _exportToFile() async {
    final data = {
      'mode': _mode.name,
      'address': _addressController.text.trim(),
      if (_mode == ConnectionMode.cloud) 'clientId': _clientIdController.text.trim(),
      if (_mode == ConnectionMode.cloud) 'clientSecret': _clientSecretController.text.trim(),
    };
    final bytes = utf8.encode(const JsonEncoder.withIndent('  ').convert(data));
    final path = await FilePicker.platform.saveFile(
      fileName: 'doc-capture-connection.json',
      bytes: bytes,
    );
    if (path == null || !mounted) return; // user cancelled
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context)!.connectionExportSuccess)),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final appState = context.read<AppState>();
    final config = ConnectionConfig(mode: _mode, address: _addressController.text.trim());
    await appState.updateConnectionConfig(
      config,
      cfAccessClientId: _mode == ConnectionMode.cloud ? _clientIdController.text.trim() : null,
      cfAccessClientSecret: _mode == ConnectionMode.cloud ? _clientSecretController.text.trim() : null,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    // Connection target changed -> any existing session is gone (handled
    // inside updateConnectionConfig) -> always land on a fresh login
    // screen, regardless of whether this was opened pre-login or from
    // inside the app's own settings (where just popping back would leave
    // RootScreen showing while the session underneath is already gone).
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  void dispose() {
    _addressController.dispose();
    _clientIdController.dispose();
    _clientSecretController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.connectionSettingsTitle)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _importFromFile,
                        icon: const Icon(Icons.file_open_outlined, size: 18),
                        label: Text(l10n.connectionImportButton, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _exportToFile,
                        icon: const Icon(Icons.save_outlined, size: 18),
                        label: Text(l10n.connectionExportButton, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                  ],
                ),
                if (_importError != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFBE9E7),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(children: [
                      const Icon(Icons.error_outline, size: 16, color: Color(0xFFC1402A)),
                      const SizedBox(width: 8),
                      Expanded(child: Text(_importError!, style: const TextStyle(fontSize: 12.5, color: Color(0xFFC1402A)))),
                    ]),
                  ),
                ],
                const SizedBox(height: 20),
                Text(l10n.connectionModeLabel, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                RadioListTile<ConnectionMode>(
                  contentPadding: EdgeInsets.zero,
                  value: ConnectionMode.direct,
                  groupValue: _mode,
                  onChanged: (v) => setState(() => _mode = v!),
                  title: Text(l10n.connectionModeDirect),
                  subtitle: Text(l10n.connectionModeDirectHint),
                ),
                RadioListTile<ConnectionMode>(
                  contentPadding: EdgeInsets.zero,
                  value: ConnectionMode.cloud,
                  groupValue: _mode,
                  onChanged: (v) => setState(() => _mode = v!),
                  title: Text(l10n.connectionModeCloud),
                  subtitle: Text(l10n.connectionModeCloudHint),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _addressController,
                  decoration: InputDecoration(
                    labelText: l10n.connectionAddressLabel,
                    hintText: _mode == ConnectionMode.direct
                        ? '192.168.1.50:3000'
                        : 'doccapture.example.com',
                    prefixIcon: const Icon(Icons.dns_outlined, size: 20),
                  ),
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                ),
                if (_mode == ConnectionMode.cloud) ...[
                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.primaryWash,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(children: [
                      const Icon(Icons.info_outline, size: 16, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(l10n.connectionCloudTokenHint,
                            style: const TextStyle(fontSize: 12.5, color: AppColors.primarySoft)),
                      ),
                    ]),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _clientIdController,
                    decoration: InputDecoration(
                      labelText: l10n.connectionClientIdLabel,
                      prefixIcon: const Icon(Icons.badge_outlined, size: 20),
                    ),
                    autocorrect: false,
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _clientSecretController,
                    decoration: InputDecoration(
                      labelText: l10n.connectionClientSecretLabel,
                      prefixIcon: const Icon(Icons.key_outlined, size: 20),
                      suffixIcon: IconButton(
                        icon: Icon(_secretVisible ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20),
                        onPressed: () => setState(() => _secretVisible = !_secretVisible),
                      ),
                    ),
                    obscureText: !_secretVisible,
                    autocorrect: false,
                  ),
                ],
                const SizedBox(height: 26),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          height: 18, width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(l10n.connectionSaveButton),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ConnectionDiagnosticsScreen(
                        config: ConnectionConfig(mode: _mode, address: _addressController.text.trim()),
                        clientId: _mode == ConnectionMode.cloud ? _clientIdController.text.trim() : null,
                        clientSecret: _mode == ConnectionMode.cloud ? _clientSecretController.text.trim() : null,
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.network_check, size: 18),
                  label: Text(l10n.connectionDiagnosticsButton),
                ),
              ],
            ),
    );
  }
}
