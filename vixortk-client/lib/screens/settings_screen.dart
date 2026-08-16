import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import 'connection_settings_screen.dart';
import 'login_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  Future<void> _confirmLogout(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(l10n.logoutConfirmTitle),
        content: Text(l10n.logoutConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.commonCancel)),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: Text(l10n.logout)),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await context.read<AppState>().logout();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final appState = context.watch<AppState>();
    final user = appState.currentUser;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.navSettings)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (user != null)
            Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: AppColors.primary,
                  child: Text(user.username.isNotEmpty ? user.username[0].toUpperCase() : '?', style: const TextStyle(color: Colors.white)),
                ),
                title: Text(user.fullName),
                subtitle: Text(user.username),
              ),
            ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.dns_outlined),
              title: Text(l10n.connectionSettingsTitle),
              subtitle: appState.connectionConfig.address.isNotEmpty ? Text(appState.connectionConfig.address, overflow: TextOverflow.ellipsis) : null,
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ConnectionSettingsScreen())),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.language, size: 20, color: AppColors.inkSoft),
                    const SizedBox(width: 12),
                    Text(l10n.appLanguage, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ]),
                  const SizedBox(height: 8),
                  DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: appState.languageCode,
                      isExpanded: true,
                      items: [
                        DropdownMenuItem(value: 'he', child: Text(l10n.languageHebrew)),
                        DropdownMenuItem(value: 'en', child: Text(l10n.languageEnglish)),
                        DropdownMenuItem(value: 'ru', child: Text(l10n.languageRussian)),
                      ],
                      onChanged: (code) { if (code != null) appState.setLanguage(code); },
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => _confirmLogout(context),
            icon: const Icon(Icons.logout, color: AppColors.stamp),
            label: Text(l10n.logout, style: const TextStyle(color: AppColors.stamp)),
            style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.stamp)),
          ),
        ],
      ),
    );
  }
}
