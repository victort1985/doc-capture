import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/notifications_service.dart';
import 'inventory_screen.dart';
import 'calls/calls_list_screen.dart';
import 'phonebook_screen.dart';
import 'calendar_screen.dart';
import 'management_screen.dart';
import 'office_screen.dart';
import '../store/app_state.dart';
import 'calls_stats_screen.dart';
import '../widgets/organization_logo_background.dart';
import '../widgets/customizable_bottom_nav.dart';

class RootScreen extends StatefulWidget {
  const RootScreen({super.key});

  @override
  State<RootScreen> createState() => _RootScreenState();
}

class _RootScreenState extends State<RootScreen> {
  int _index = 0; // still used for the desktop NavigationRail, which doesn't need reordering
  String? _selectedId;
  List<String>? _tabOrder;
  Set<String>? _lastBaseTabIds;
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
          setState(() { _index = 1; _selectedId = 'calls'; }); // switch to the Calls tab
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
    final user = context.watch<AppState>().currentUser;
    final hasOfficeAccess = (user?.hasPermission('office.delivery_notes') ?? false) ||
        (user?.hasPermission('office.quotes') ?? false) ||
        (user?.hasPermission('office.invoices') ?? false) ||
        (user?.hasPermission('office.orders') ?? false) ||
        (user?.hasPermission('office.payments') ?? false);

    final screensById = <String, Widget>{
      'home': const InventoryScreen(),
      'calls': CallsListScreen(key: _callsListKey),
      'phonebook': const PhoneBookScreen(),
      'calendar': const CalendarScreen(),
      'management': const ManagementScreen(),
      if (hasOfficeAccess) 'office': const OfficeScreen(),
    };
    // Fixed regardless of the customizable nav bar's visual order —
    // this is what keeps IndexedStack's state-preservation (scroll
    // position, form drafts, etc.) working: the STACK's order never
    // changes, only which index is selected does.
    final canonicalIds = screensById.keys.toList();

    final baseTabs = [
      BottomNavTab(id: 'home', icon: Icons.inventory_2_outlined, selectedIcon: Icons.inventory_2, label: l10n.navHome),
      BottomNavTab(id: 'calls', icon: Icons.support_agent_outlined, selectedIcon: Icons.support_agent, label: l10n.callsTitle),
      BottomNavTab(id: 'phonebook', icon: Icons.contacts_outlined, selectedIcon: Icons.contacts, label: l10n.phoneBookTitle),
      BottomNavTab(id: 'calendar', icon: Icons.calendar_month_outlined, selectedIcon: Icons.calendar_month, label: l10n.calendarTitle),
      BottomNavTab(id: 'management', icon: Icons.build_outlined, selectedIcon: Icons.build, label: l10n.managementTitle),
      if (hasOfficeAccess) BottomNavTab(id: 'office', icon: Icons.apartment_outlined, selectedIcon: Icons.apartment, label: l10n.officeTitle),
    ];

    final currentBaseIds = baseTabs.map((t) => t.id).toSet();
    final baseIdsChanged = _lastBaseTabIds != null &&
        (currentBaseIds.length != _lastBaseTabIds!.length || !currentBaseIds.every(_lastBaseTabIds!.contains));
    if (baseIdsChanged) {
      // The set of available tabs changed since the last build (most
      // commonly: permissions finished loading asynchronously after
      // the first frame, or changed while the app was backgrounded and
      // got refreshed on resume) — force a fresh read+reconcile against
      // SharedPreferences rather than trusting whatever _tabOrder
      // already holds in memory.
      _tabOrder = null;
    }
    _lastBaseTabIds = currentBaseIds;

    if (_tabOrder == null) {
      // Kick off the (async) load once; render with the default order
      // in the meantime so the first frame isn't blocked on disk I/O.
      CustomizableBottomNav.loadOrder(baseTabs).then((order) {
        if (mounted) setState(() => _tabOrder = order);
      });
    }
    final order = _tabOrder ?? baseTabs.map((t) => t.id).toList();
    final byId = { for (final t in baseTabs) t.id: t };
    final orderedTabs = order.where(byId.containsKey).map((id) => byId[id]!).toList();
    for (final t in baseTabs) {
      if (!orderedTabs.any((o) => o.id == t.id)) orderedTabs.add(t);
    }

    _selectedId ??= orderedTabs.first.id;
    if (!orderedTabs.any((t) => t.id == _selectedId)) _selectedId = orderedTabs.first.id;
    final canonicalIndex = canonicalIds.indexOf(_selectedId!).clamp(0, canonicalIds.length - 1);

    // Desktop still uses the plain fixed-order rail — reordering a
    // touch-only gesture doesn't map cleanly onto a rail meant to be
    // used with a mouse, and a desktop user isn't the one juggling a
    // phone one-handed in the field this feature is actually for.
    final destinations = baseTabs;
    if (_index >= destinations.length) _index = 0;

    if (isDesktop) {
      // ── Desktop layout: NavigationRail sidebar + content ──────────────────
      return Scaffold(
        body: Row(children: [
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
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.asset('assets/icons/app_icon.png', width: 40, height: 40),
                  ),
                  const SizedBox(height: 4),
                  const Text('VIXOR', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 2)),
                ]),
              ),
              destinations: destinations.map((d) => NavigationRailDestination(
                icon: Icon(d.icon),
                selectedIcon: Icon(d.selectedIcon),
                label: Text(d.label),
              )).toList(),
            ),
            const VerticalDivider(width: 1, thickness: 1, color: Color(0x22FFFFFF)),
            Expanded(
              child: OrganizationLogoBackground(
                fit: BoxFit.fitHeight,
                backgroundColor: Colors.white,
                child: IndexedStack(
                  index: canonicalIds.indexOf(destinations[_index].id).clamp(0, canonicalIds.length - 1),
                  children: canonicalIds.map((id) => screensById[id]!).toList(),
                ),
              ),
            ),
        ]),
      );
    }

    // ── Mobile layout: customizable bottom nav ────────────────────────────
    return Scaffold(
      body: OrganizationLogoBackground(
        child: IndexedStack(
          index: canonicalIndex,
          children: canonicalIds.map((id) => screensById[id]!).toList(),
        ),
      ),
      bottomNavigationBar: CustomizableBottomNav(
        tabs: orderedTabs,
        selectedId: _selectedId!,
        onSelect: (id) => setState(() => _selectedId = id),
        doneLabel: l10n.bottomNavDone,
        editHintLabel: l10n.bottomNavEditHint,
      ),
    );
  }
}
