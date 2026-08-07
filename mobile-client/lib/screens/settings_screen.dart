import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import 'connection_settings_screen.dart';
import 'login_screen.dart';
import 'organization_picker_gate_screen.dart';
import 'terms_of_service_viewer_screen.dart';
import 'two_factor_settings_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.appState});

  final AppState appState;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
      children: [
        Card(
          color: Colors.amber.shade50,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('DEBUG — временно, для диагностики ToS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                const SizedBox(height: 6),
                Text('user id: ${appState.currentUser?.id}', style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
                Text('tosAccepted (from server): ${appState.currentUser?.tosAccepted}', style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
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
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.dashboard_customize_outlined, size: 18, color: AppColors.inkSoft),
                  const SizedBox(width: 8),
                  Text(l10n.navStyleSectionTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
                const SizedBox(height: 12),
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  value: 'classic',
                  groupValue: appState.navStyle,
                  onChanged: (v) { if (v != null) appState.setNavStyle(v); },
                  title: Text(l10n.navStyleClassic, style: const TextStyle(fontSize: 13.5)),
                ),
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  value: 'actionHub',
                  groupValue: appState.navStyle,
                  onChanged: (v) { if (v != null) appState.setNavStyle(v); },
                  title: Text(l10n.navStyleActionHub, style: const TextStyle(fontSize: 13.5)),
                ),
                const SizedBox(height: 4),
                Text(l10n.navStyleHint, style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: const Icon(Icons.dns_outlined, color: AppColors.inkSoft),
            title: Text(l10n.connectionSettingsTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ConnectionSettingsScreen()),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: const Icon(Icons.description_outlined, color: AppColors.inkSoft),
            title: Text(l10n.settingsViewTos, style: const TextStyle(fontWeight: FontWeight.w600)),
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => TermsOfServiceViewerScreen(language: appState.currentUser?.language ?? appState.languageCode)),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: const Icon(Icons.shield_outlined, color: AppColors.inkSoft),
            title: Text(l10n.twoFactorTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const TwoFactorSettingsScreen()),
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (appState.switchableOrgs.length > 1) ...[
          OutlinedButton.icon(
            icon: const Icon(Icons.apartment_outlined, size: 18, color: AppColors.primary),
            label: Text(l10n.switchOrganization, style: const TextStyle(color: AppColors.primary)),
            style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.primary)),
            onPressed: () {
              // Same defensive pattern as the sign-out button right
              // below: flip the state main.dart's own top-level
              // routing reacts to, AND explicitly clear whatever
              // nested navigator stack got this settings screen open
              // in the first place — this screen is typically several
              // pushes deep from RootScreen, and just relying on the
              // reactive root swap alone could leave that old stack
              // sitting underneath in a confusing state.
              appState.returnToOrganizationPicker();
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const OrganizationPickerGateScreen()),
                (route) => false,
              );
            },
          ),
          const SizedBox(height: 10),
        ],
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
      ),
    );
  }
}
