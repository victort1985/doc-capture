import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../store/app_state.dart';

class TwoFactorSettingsScreen extends StatefulWidget {
  const TwoFactorSettingsScreen({super.key});
  @override
  State<TwoFactorSettingsScreen> createState() => _TwoFactorSettingsScreenState();
}

class _TwoFactorSettingsScreenState extends State<TwoFactorSettingsScreen> {
  bool? _enabled;
  String? _qrDataUrl;
  String? _secret;
  final _confirmController = TextEditingController();
  final _disablePasswordController = TextEditingController();
  bool _showDisable = false;
  bool _busy = false;
  String? _error;

  Future<void> _startSetup() async {
    setState(() { _error = null; _busy = true; });
    try {
      final res = await context.read<ApiService>().post('/auth/2fa/setup', {});
      setState(() { _secret = res['secret'] as String?; _qrDataUrl = res['qrDataUrl'] as String?; });
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmSetup() async {
    setState(() { _error = null; _busy = true; });
    try {
      await context.read<ApiService>().post('/auth/2fa/confirm', {'code': _confirmController.text.trim()});
      await context.read<AppState>().refreshCurrentUser();
      setState(() { _enabled = true; _qrDataUrl = null; _secret = null; _confirmController.clear(); });
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disable() async {
    setState(() { _error = null; _busy = true; });
    try {
      await context.read<ApiService>().post('/auth/2fa/disable', {'password': _disablePasswordController.text});
      await context.read<AppState>().refreshCurrentUser();
      setState(() { _enabled = false; _showDisable = false; _disablePasswordController.clear(); });
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _enabled = context.read<AppState>().currentUser?.totpEnabled ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.twoFactorTitle)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
                ),

              if (_enabled != true && _qrDataUrl == null)
                FilledButton(onPressed: _busy ? null : _startSetup, child: Text(l10n.twoFactorEnable)),

              if (_enabled != true && _qrDataUrl != null) ...[
                Text(l10n.twoFactorScanHint, style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 12),
                Center(
                  child: Image.memory(
                    base64Decode(_qrDataUrl!.split(',').last),
                    width: 220, height: 220,
                  ),
                ),
                if (_secret != null) ...[
                  const SizedBox(height: 8),
                  SelectableText(_secret!, textAlign: TextAlign.center, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                ],
                const SizedBox(height: 16),
                TextField(
                  controller: _confirmController,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: InputDecoration(labelText: l10n.totpCode, counterText: ''),
                ),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : _confirmSetup, child: Text(l10n.twoFactorConfirm)),
              ],

              if (_enabled == true && !_showDisable) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.green.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                  child: Text(l10n.twoFactorEnabled, style: const TextStyle(fontSize: 13)),
                ),
                const SizedBox(height: 16),
                OutlinedButton(onPressed: () => setState(() => _showDisable = true), child: Text(l10n.twoFactorDisable)),
              ],
              if (_enabled == true && _showDisable) ...[
                TextField(
                  controller: _disablePasswordController,
                  obscureText: true,
                  decoration: InputDecoration(labelText: l10n.password),
                ),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : _disable, child: Text(l10n.twoFactorConfirmDisable)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
