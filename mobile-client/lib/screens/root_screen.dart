import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/notifications_service.dart';
import 'inventory_screen.dart';
import 'calls/calls_list_screen.dart';
import 'phonebook_screen.dart';
import '../widgets/organization_logo_background.dart';

class RootScreen extends StatefulWidget {
  const RootScreen({super.key});

  @override
  State<RootScreen> createState() => _RootScreenState();
}

class _RootScreenState extends State<RootScreen> {
  int _index = 0;
  final _callsListKey = GlobalKey<CallsListScreenState>();

  @override
  void initState() {
    super.initState();
    // Connecting here (once, for the lifetime of being logged in) rather
    // than inside CallsListScreen means a popup can still show even while
    // looking at the Переучет tab, not just while the Вызов tab is open.
    WidgetsBinding.instance.addPostFrameCallback((_) => _connectNotifications());
  }

  void _connectNotifications() {
    final l10n = AppLocalizations.of(context)!;
    final notifications = context.read<NotificationsService>();
    notifications.connect(
      onCallCreated: (id, place, createdBy) => _popup(
        l10n.callPopupCreated(place, createdBy),
        onTap: () {
          setState(() => _index = 1); // switch to the Calls tab
          _callsListKey.currentState?.openCall(id);
        },
      ),
      onStatusChanged: (place, status, changedBy) => _popup(l10n.callPopupStatusChanged(place, changedBy)),
      onNoteAdded: (place, author) => _popup(l10n.callPopupNoteAdded(place, author)),
      onAttachmentAdded: (place, uploadedBy) => _popup(l10n.callPopupFileAdded(place, uploadedBy)),
    );
  }

  void _popup(String message, {VoidCallback? onTap}) {
    if (!mounted) return;
    final l10n = AppLocalizations.of(context)!;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      action: onTap != null ? SnackBarAction(label: l10n.callPopupView, onPressed: onTap) : null,
    ));
    _callsListKey.currentState?.refresh();
  }

  @override
  void dispose() {
    context.read<NotificationsService>().disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      body: OrganizationLogoBackground(
        child: IndexedStack(
          index: _index,
          children: [
            const InventoryScreen(),
            CallsListScreen(key: _callsListKey),
            const PhoneBookScreen(),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.inventory_2_outlined),
            selectedIcon: const Icon(Icons.inventory_2),
            label: l10n.inventoryTitle,
          ),
          NavigationDestination(
            icon: const Icon(Icons.support_agent_outlined),
            selectedIcon: const Icon(Icons.support_agent),
            label: l10n.callsTitle,
          ),
          NavigationDestination(
            icon: const Icon(Icons.contacts_outlined),
            selectedIcon: const Icon(Icons.contacts),
            label: l10n.phoneBookTitle,
          ),
        ],
      ),
    );
  }
}
