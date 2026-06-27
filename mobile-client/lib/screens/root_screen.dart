import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/notifications_service.dart';
import 'inventory_screen.dart';
import 'calls/calls_list_screen.dart';
import 'phonebook_screen.dart';
import 'calendar_screen.dart';
import 'management_screen.dart';
import 'delivery_notes_screen.dart';
import '../services/delivery_notes_service.dart';
import 'calls_stats_screen.dart';
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
    final isDesktop = MediaQuery.of(context).size.width >= 900;

    final screens = [
      const InventoryScreen(),
      CallsListScreen(key: _callsListKey),
      const PhoneBookScreen(),
      const CalendarScreen(),
      const ManagementScreen(),
      DeliveryNotesScreen(),
    ];

    final destinations = [
      (Icons.inventory_2_outlined, Icons.inventory_2, l10n.inventoryTitle),
      (Icons.support_agent_outlined, Icons.support_agent, l10n.callsTitle),
      (Icons.contacts_outlined, Icons.contacts, l10n.phoneBookTitle),
      (Icons.calendar_month_outlined, Icons.calendar_month, l10n.calendarTitle),
      (Icons.build_outlined, Icons.build, l10n.managementTitle),
      (Icons.assignment_outlined, Icons.assignment, l10n.deliveryNotesTitle),
    ];

    if (isDesktop) {
      // ── Desktop layout: NavigationRail sidebar + content ──────────────────
      return Scaffold(
        body: OrganizationLogoBackground(
          child: Row(children: [
            NavigationRail(
              extended: MediaQuery.of(context).size.width >= 1200,
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              backgroundColor: const Color(0xFF0E1642),
              selectedIconTheme: const IconThemeData(color: Color(0xFFF2701C)),
              unselectedIconTheme: const IconThemeData(color: Colors.white54),
              selectedLabelTextStyle: const TextStyle(color: Color(0xFFF2701C), fontWeight: FontWeight.w700, fontSize: 13),
              unselectedLabelTextStyle: const TextStyle(color: Colors.white54, fontSize: 12),
              leading: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Column(children: [
                  Container(
                    width: 40, height: 40,
                    
                    child: const Center(child: Text('V', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 22))),
                  ),
                  const SizedBox(height: 4),
                  const Text('VIXOR', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 2)),
                ]),
              ),
              destinations: destinations.map((d) => NavigationRailDestination(
                icon: Icon(d.$1),
                selectedIcon: Icon(d.$2),
                label: Text(d.$3),
              )).toList(),
            ),
            const VerticalDivider(width: 1, thickness: 1, color: Color(0x22FFFFFF)),
            Expanded(
              child: IndexedStack(index: _index, children: screens),
            ),
          ]),
        ),
      );
    }

    // ── Mobile layout: bottom NavigationBar ───────────────────────────────────
    return Scaffold(
      body: OrganizationLogoBackground(
        child: IndexedStack(
          index: _index,
          children: screens,
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        height: 64,
        destinations: destinations.map((d) => NavigationDestination(
          icon: Icon(d.$1),
          selectedIcon: Icon(d.$2),
          label: d.$3,
        )).toList(),
      ),
    );
  }
}
