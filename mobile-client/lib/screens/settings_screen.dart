import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import 'login_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.appState});

  final AppState appState;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.language, size: 18, color: AppColors.inkSoft),
                  const SizedBox(width: 8),
                  Text(l10n.language, style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
                const SizedBox(height: 12),
                DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: appState.languageCode,
                    isExpanded: true,
                    items: [
                      DropdownMenuItem(value: 'he', child: Text(l10n.languageHebrew)),
                      DropdownMenuItem(value: 'en', child: Text(l10n.languageEnglish)),
                      DropdownMenuItem(value: 'ru', child: Text(l10n.languageRussian)),
                    ],
                    onChanged: (code) {
                      if (code != null) appState.setLanguage(code);
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          icon: const Icon(Icons.logout, size: 18, color: AppColors.stamp),
          label: Text(l10n.signOut, style: const TextStyle(color: AppColors.stamp)),
          style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.stampWash)),
          onPressed: () async {
            await appState.logout();
            if (context.mounted) {
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (route) => false,
              );
            }
          },
        ),
      ],
    );
  }
}
