import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class BottomNavTab {
  const BottomNavTab({
    required this.id,
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  /// Stable identity used for persisting the order — NOT the same as
  /// the array index, since the Office tab only exists conditionally
  /// (permission-gated) and indices would shift around under it.
  final String id;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

const _prefsKey = 'bottom_nav_order_v1';

/// A bottom nav bar the person can rearrange to fit how they actually
/// work day to day — hold any tab to enter edit mode (every icon
/// starts a subtle wiggle, like rearranging iOS home screen icons),
/// drag tabs into the order you want, tap the checkmark to save.
class CustomizableBottomNav extends StatefulWidget {
  const CustomizableBottomNav({
    super.key,
    required this.tabs,
    required this.selectedId,
    required this.onSelect,
    required this.doneLabel,
    required this.editHintLabel,
  });

  final List<BottomNavTab> tabs;
  final String selectedId;
  final ValueChanged<String> onSelect;
  final String doneLabel;
  final String editHintLabel;

  /// Loads the saved tab order (as a list of ids) and reconciles it
  /// against the currently-available tabs — new tabs not seen before
  /// get appended at the end, tabs that no longer exist (e.g. Office
  /// access was revoked) are silently dropped.
  static Future<List<String>> loadOrder(List<BottomNavTab> tabs) async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getStringList(_prefsKey);
    final availableIds = tabs.map((t) => t.id).toSet();
    if (saved == null) return tabs.map((t) => t.id).toList();
    final reconciled = saved.where(availableIds.contains).toList();
    for (final t in tabs) {
      if (!reconciled.contains(t.id)) reconciled.add(t.id);
    }
    return reconciled;
  }

  static Future<void> _saveOrder(List<String> order) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_prefsKey, order);
  }

  @override
  State<CustomizableBottomNav> createState() => _CustomizableBottomNavState();
}

class _CustomizableBottomNavState extends State<CustomizableBottomNav> with SingleTickerProviderStateMixin {
  bool _editMode = false;
  int? _draggingIndex;
  int? _hoverIndex;
  late AnimationController _wiggleController;

  @override
  void initState() {
    super.initState();
    _wiggleController = AnimationController(vsync: this, duration: const Duration(milliseconds: 160))..repeat(reverse: true);
  }

  @override
  void dispose() {
    _wiggleController.dispose();
    super.dispose();
  }

  void _enterEditMode() {
    if (_editMode) return;
    setState(() => _editMode = true);
  }

  void _exitEditMode() {
    setState(() { _editMode = false; _draggingIndex = null; _hoverIndex = null; });
    CustomizableBottomNav._saveOrder(widget.tabs.map((t) => t.id).toList());
  }

  void _reorder(int from, int to) {
    if (from == to) return;
    // The caller (widget.tabs) is already index-ordered by the parent;
    // ask it to move the tab by reporting the swap through onSelect's
    // sibling callback isn't available here, so we mutate a local copy
    // and hand the resulting order back via the parent rebuilding with
    // a new `tabs` list — see _reorderedTabs below.
    setState(() {
      final tabs = List<BottomNavTab>.from(widget.tabs);
      final moved = tabs.removeAt(from);
      tabs.insert(to, moved);
      _reorderedTabs = tabs;
    });
  }

  List<BottomNavTab>? _reorderedTabs;

  @override
  Widget build(BuildContext context) {
    final tabs = _reorderedTabs ?? widget.tabs;
    final theme = Theme.of(context);

    return Material(
      color: theme.colorScheme.surface,
      elevation: 3,
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: _editMode ? 78 : 64,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_editMode)
                GestureDetector(
                  onTap: _exitEditMode,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    color: theme.colorScheme.primaryContainer.withOpacity(0.35),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(widget.editHintLabel, style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurfaceVariant)),
                        const SizedBox(width: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
                          decoration: BoxDecoration(color: theme.colorScheme.primary, borderRadius: BorderRadius.circular(999)),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            const Icon(Icons.check, size: 14, color: Colors.white),
                            const SizedBox(width: 4),
                            Text(widget.doneLabel, style: const TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                          ]),
                        ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: Row(
                  children: List.generate(tabs.length, (i) => Expanded(child: _buildTab(context, tabs, i))),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTab(BuildContext context, List<BottomNavTab> tabs, int index) {
    final tab = tabs[index];
    final selected = tab.id == widget.selectedId;
    final theme = Theme.of(context);
    final color = selected ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant;

    Widget content = AnimatedBuilder(
      animation: _wiggleController,
      builder: (context, child) {
        final wiggle = _editMode ? (_wiggleController.value - 0.5) * 0.035 : 0.0;
        return Transform.rotate(angle: wiggle, child: child);
      },
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(selected ? tab.selectedIcon : tab.icon, color: color, size: 24),
          const SizedBox(height: 2),
          Text(tab.label, style: TextStyle(fontSize: 11, color: color, fontWeight: selected ? FontWeight.w700 : FontWeight.w500)),
        ],
      ),
    );

    if (!_editMode) {
      // Long-pressing (before it turns into a drag) is what flips
      // _editMode on — a plain tap still just navigates, same as any
      // ordinary bottom nav.
      return GestureDetector(
        onTap: () => widget.onSelect(tab.id),
        onLongPress: _enterEditMode,
        child: content,
      );
    }

    // Edit mode: every tab is a drag source AND a drop target, so
    // dropping tab A onto tab B's position swaps them directly —
    // no separate "insert between" gaps to reason about.
    return DragTarget<int>(
      onWillAcceptWithDetails: (details) {
        setState(() => _hoverIndex = index);
        return details.data != index;
      },
      onLeave: (_) => setState(() => _hoverIndex = null),
      onAcceptWithDetails: (details) {
        _reorder(details.data, index);
        setState(() { _draggingIndex = null; _hoverIndex = null; });
      },
      builder: (context, candidateData, rejectedData) {
        final isHover = _hoverIndex == index && _draggingIndex != index;
        return AnimatedScale(
          scale: isHover ? 1.12 : 1.0,
          duration: const Duration(milliseconds: 120),
          child: LongPressDraggable<int>(
            data: index,
            onDragStarted: () => setState(() => _draggingIndex = index),
            onDragEnd: (_) => setState(() { _draggingIndex = null; _hoverIndex = null; }),
            feedback: Material(color: Colors.transparent, child: Opacity(opacity: 0.85, child: content)),
            childWhenDragging: Opacity(opacity: 0.25, child: content),
            child: content,
          ),
        );
      },
    );
  }
}
