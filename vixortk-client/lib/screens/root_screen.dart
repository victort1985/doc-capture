import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/time_clock_service.dart';
import '../store/app_state.dart';
import 'home_screen.dart';
import 'timekeeper_screen.dart';
import 'payslip_screen.dart';
import 'calendar_screen.dart';
import 'settings_screen.dart';

class RootScreen extends StatefulWidget {
  const RootScreen({super.key});

  @override
  State<RootScreen> createState() => _RootScreenState();
}

class _RootScreenState extends State<RootScreen> {
  int _index = 0; // 0 = Home — reached via the center button, not a bottom-nav tab of its own
  late final TimeClockService _timeClockSvc;
  TimeClockShift? _openShift;
  bool _clockBusy = false;

  /// Bumped after every successful clock-in/out so HomeScreen's own
  /// FutureBuilder(s) re-fetch fresh status/gross-pay rather than
  /// showing stale data from before the tap — a simple refresh signal
  /// rather than a full state-management layer, since this is the
  /// only piece of cross-tab-reactive state this app has.
  int _refreshToken = 0;

  @override
  void initState() {
    super.initState();
    _timeClockSvc = TimeClockService(context.read<ApiService>());
    _loadStatus();
  }

  Future<void> _loadStatus() async {
    try {
      final status = await _timeClockSvc.myStatus();
      if (mounted) setState(() => _openShift = status);
    } catch (_) {
      // Silently ignored here — HomeScreen's own status display
      // handles and surfaces a real error for the person to see;
      // this copy of the status only drives the center button's
      // start/end icon and shouldn't block the rest of the shell on
      // a transient fetch failure.
    }
  }

  /// The center button does double duty depending on which screen is
  /// showing: on Home (index 0) it's the actual clock-in/out action;
  /// on every other tab it becomes "проходная" — a return-to-Home
  /// shortcut, since Home itself isn't a regular bottom-nav tab
  /// anymore (reached only through this button). Splitting these two
  /// jobs onto the same physical button, rather than adding a
  /// separate Home tab back in, was requested specifically to keep
  /// the bar to four regular tabs either way.
  Future<void> _onCenterButtonPressed() async {
    if (_index != 0) {
      setState(() => _index = 0);
      return;
    }
    await _toggleClock();
  }

  Future<void> _toggleClock() async {
    setState(() => _clockBusy = true);
    try {
      if (_openShift == null) {
        await _timeClockSvc.clockIn();
      } else {
        await _timeClockSvc.clockOut();
      }
      await _loadStatus();
      setState(() => _refreshToken++);
    } catch (_) {
      // Errors surface via HomeScreen's own clock-in/out UI (this
      // shell-level button is a convenience shortcut reachable from
      // any tab) — a silent failure here just means the button
      // didn't visibly change state, not a lost or corrupted action,
      // since myStatus() is re-fetched either way on the next load.
    } finally {
      if (mounted) setState(() => _clockBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    final screens = [
      HomeScreen(refreshToken: _refreshToken, onClockChanged: () => setState(() => _refreshToken++)),
      const TimekeeperScreen(),
      const PayslipScreen(),
      const CalendarScreen(),
      const SettingsScreen(),
    ];

    final tabs = [
      (icon: Icons.event_note_outlined, selectedIcon: Icons.event_note, label: l10n.navTimekeeper),
      (icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long, label: l10n.navPayslip),
      (icon: Icons.calendar_month_outlined, selectedIcon: Icons.calendar_month, label: l10n.navCalendar),
      (icon: Icons.settings_outlined, selectedIcon: Icons.settings, label: l10n.navSettings),
    ];
    // Four regular tabs (Home isn't one of them — see _onCenterButtonPressed's
    // own doc comment), split 2+2 around the center FAB notch, matching
    // CircularNotchedRectangle's expectation of a symmetric BottomAppBar.
    final leftTabs = tabs.sublist(0, 2);
    final rightTabs = tabs.sublist(2);

    Widget buildTab(int tabIndex, ({IconData icon, IconData selectedIcon, String label}) tab) {
      final selected = tabIndex == _index;
      return Expanded(
        child: InkWell(
          onTap: () => setState(() => _index = tabIndex),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(selected ? tab.selectedIcon : tab.icon, size: 22, color: selected ? AppColors.primary : Colors.grey.shade500),
              const SizedBox(height: 2),
              Text(tab.label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: selected ? AppColors.primary : Colors.grey.shade500)),
            ],
          ),
        ),
      );
    }

    return Stack(children: [
      Scaffold(
        body: IndexedStack(index: _index, children: screens),
        floatingActionButton: FloatingActionButton(
          backgroundColor: AppColors.stamp,
          onPressed: _clockBusy ? null : _onCenterButtonPressed,
          tooltip: _index != 0
              ? l10n.navHome
              : (_openShift == null ? l10n.timeClockClockIn : l10n.timeClockClockOut),
          child: _clockBusy
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Icon(
                  _index != 0
                      ? Icons.home_filled
                      : (_openShift == null ? Icons.play_arrow : Icons.stop),
                  color: Colors.white,
                ),
        ),
        floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
        bottomNavigationBar: BottomAppBar(
          shape: const CircularNotchedRectangle(),
          notchMargin: 8,
          child: SafeArea(
            child: SizedBox(
              height: 56,
              child: Row(children: [
                for (var i = 0; i < leftTabs.length; i++) buildTab(i + 1, leftTabs[i]),
                const SizedBox(width: 40),
                for (var i = 0; i < rightTabs.length; i++) buildTab(leftTabs.length + i + 1, rightTabs[i]),
              ]),
            ),
          ),
        ),
      ),
      // Pinned, semi-transparent settings shortcut — end-aligned via
      // PositionedDirectional so it sits at the physical top-right for
      // LTR languages and top-left for Hebrew automatically, matching
      // the same fixed-position pattern already built for the main
      // Vixor ERP app. Redundant with the Settings tab in the bottom
      // nav by design (both were explicitly requested) — this is a
      // one-tap shortcut reachable from any tab without switching to
      // the Settings tab first.
      PositionedDirectional(
        top: MediaQuery.of(context).padding.top + 8,
        end: 12,
        child: Material(
          color: Colors.black.withOpacity(0.35),
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () => setState(() => _index = 4),
            child: const Padding(
              padding: EdgeInsets.all(10),
              child: Icon(Icons.settings, color: Colors.white, size: 22),
            ),
          ),
        ),
      ),
    ]);
  }
}
