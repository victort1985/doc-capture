import 'package:flutter/material.dart';

/// Plain data holder for a single bottom-nav-style destination —
/// used by the desktop NavigationRail (root_screen.dart's own
/// `baseTabs`/`destinations`). The reorderable/customizable mobile
/// bottom-nav widget that used to live in this file (and the
/// SharedPreferences-backed tab-order persistence it needed) was
/// removed along with the "classic" mobile nav style entirely — the
/// mobile app now has exactly one nav style (Action Hub, see
/// root_screen.dart), so there was nothing left to customize the
/// order OF on mobile. Kept this one small class (rather than
/// inlining it into root_screen.dart) purely so the desktop rail's
/// own code didn't need to change shape along with the removal.
class BottomNavTab {
  const BottomNavTab({
    required this.id,
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  final String id;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}
