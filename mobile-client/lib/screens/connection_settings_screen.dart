import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/connection_file_crypto.dart';
import '../services/settings_service.dart';
import '../store/app_state.dart';
import 'connection_diagnostics_screen.dart';
import 'login_screen.dart';

/// Deliberately has no manual "type in a server address" path anymore —
/// a customer gets a single .vxconn file from us (generated per
/// organization in the license admin panel) and just picks it here.
/// Nothing to type, nothing to get wrong, and it can't be repointed at
/// another organization's server by editing a text file since it's
/// encrypted (see connection_file_crypto.dart).
class ConnectionSettingsScreen extends StatefulWidget {
  const ConnectionSettingsScreen({super.key});

  @override
  State<ConnectionSettingsScreen> createState() => _ConnectionSettingsScreenState();
}

class _ConnectionSettingsScreenState extends State<ConnectionSettingsScreen> {
  bool _loading = false;
  String? _error;
  ConnectionConfig? _currentConfig;

  @override
  void initState() {
    super.initState();
    _currentConfig = context.read<AppState>().connectionConfig;
  }

  Future<void> _importFromFile() async {
    setState(() { _error = null; _loading = true; });
    try {
      // FileType.custom + allowedExtensions relies on the OS
      // recognizing the extension (a registered UTI on iOS) — an
      // invented extension like .vxconn often isn't, and the file
      // shows up greyed out/unselectable in the native picker even
      // though it's right there. FileType.any sidesteps that
      // entirely; decryptConnectionFile() below already rejects
      // anything that isn't a valid connection file with a clear
      // error, so there's no real validation lost.
      final result = await FilePicker.platform.pickFiles(type: FileType.any);
      final path = result?.files.single.path;
      if (path == null) { setState(() => _loading = false); return; } // user cancelled

      final bytes = await File(path).readAsBytes();
      final data = decryptConnectionFile(bytes);

      final modeStr = data['mode'] as String?;
      final mode = modeStr == ConnectionMode.cloud.name ? ConnectionMode.cloud : ConnectionMode.direct;
      final address = (data['address'] as String).trim();
      final clientId = (data['clientId'] as String?)?.trim();
      final clientSecret = (data['clientSecret'] as String?)?.trim();

      final appState = context.read<AppState>();
      await appState.updateConnectionConfig(
        ConnectionConfig(mode: mode, address: address),
        cfAccessClientId: mode == ConnectionMode.cloud ? clientId : null,
        cfAccessClientSecret: mode == ConnectionMode.cloud ? clientSecret : null,
      );
      if (!mounted) return;
      // Connection target changed -> any existing session is gone
      // (handled inside updateConnectionConfig) -> always land on a
      // fresh login screen.
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (route) => false,
      );
    } on ConnectionFileException catch (e) {
      setState(() { _error = e.message; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = AppLocalizations.of(context)!.connectionImportError; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.connectionSettingsTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
        children: [
          if (_currentConfig != null && _currentConfig!.address.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surfaceMuted,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(children: [
                const Icon(Icons.dns_outlined, size: 18, color: AppColors.inkSoft),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(_currentConfig!.address,
                      style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
                      overflow: TextOverflow.ellipsis),
                ),
              ]),
            ),
            const SizedBox(height: 20),
          ],
          Text(l10n.connectionImportHint, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13.5)),
          const SizedBox(height: 16),
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFBE9E7),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(children: [
                const Icon(Icons.error_outline, size: 16, color: Color(0xFFC1402A)),
                const SizedBox(width: 8),
                Expanded(child: Text(_error!, style: const TextStyle(fontSize: 12.5, color: Color(0xFFC1402A)))),
              ]),
            ),
            const SizedBox(height: 14),
          ],
          FilledButton.icon(
            onPressed: _loading ? null : _importFromFile,
            icon: _loading
                ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.file_open_outlined, size: 18),
            label: Text(l10n.connectionImportButton),
          ),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: () async {
              final appState = context.read<AppState>();
              String? clientId;
              String? clientSecret;
              if (_currentConfig?.mode == ConnectionMode.cloud) {
                final (id, secret) = await appState.getCfServiceToken();
                clientId = id;
                clientSecret = secret;
              }
              if (!mounted) return;
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ConnectionDiagnosticsScreen(
                    config: _currentConfig ?? const ConnectionConfig(mode: ConnectionMode.direct, address: ''),
                    clientId: clientId,
                    clientSecret: clientSecret,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.network_check, size: 18),
            label: Text(l10n.connectionDiagnosticsButton),
          ),
        ],
      ),
    );
  }
}
