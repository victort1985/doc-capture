import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import 'calendar_screen.dart';
import 'management_screen.dart';
import 'settings_screen.dart';
import 'inventory_screen.dart';

/// The 4th bottom tab in the "Action Hub" nav style — everything that
/// doesn't fit in Home/Calls/Contacts, reached one tap further in
/// rather than living in the bottom bar itself. See root_screen.dart
/// for where this is wired in alongside the "classic" nav style.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final appState = context.watch<AppState>();

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.navMore), backgroundColor: Colors.transparent),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                leading: const Icon(Icons.document_scanner_outlined, color: AppColors.inkSoft),
                title: Text(l10n.navScan, style: const TextStyle(fontWeight: FontWeight.w600)),
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const InventoryScreen()),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Card(
              child: ListTile(
                leading: const Icon(Icons.calendar_month_outlined, color: AppColors.inkSoft),
                title: Text(l10n.calendarTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const CalendarScreen()),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Card(
              child: ListTile(
                leading: const Icon(Icons.build_outlined, color: AppColors.inkSoft),
                title: Text(l10n.managementTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ManagementScreen()),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Card(
              child: ListTile(
                leading: const Icon(Icons.settings_outlined, color: AppColors.inkSoft),
                title: Text(l10n.settingsTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => SettingsScreen(appState: appState)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
