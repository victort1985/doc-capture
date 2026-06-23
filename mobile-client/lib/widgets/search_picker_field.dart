import 'dart:async';
import 'package:flutter/material.dart';
import '../app/theme.dart';

/// Generic "type to search, pick from a list" field — used for city,
/// location, and phone-book-contact pickers (spec: search by typing the
/// first letters instead of free-typing the value every time).
///
/// Deliberately renders results as a simple list below the field rather
/// than a floating overlay — simpler and more reliable than fighting
/// Flutter's built-in Autocomplete widget, which only supports
/// synchronous option lookups (this needs a debounced server search).
class SearchPickerField<T> extends StatefulWidget {
  // Note: NOT a const constructor — Flutter 3.44+ enforces that every
  // final field in a const constructor has an initializer in the
  // declaration itself (not via 'this.listLabel' in the parameter list),
  // which would force us to drop the nullable Function type or add a
  // late keyword. Removing const is cleaner and has no real downside
  // here since SearchPickerField is always rebuilt with fresh data anyway.
  SearchPickerField({
    super.key,
    required this.search,
    required this.displayString,
    this.listLabel,
    required this.onSelected,
    this.hintText,
    this.initialText,
    this.enabled = true,
    this.controller,
    this.onTextChanged,
  });

  final Future<List<T>> Function(String query) search;
  /// What gets written into the field once an item is selected — keep
  /// this the "clean" value (e.g. just the location name), since it's
  /// also what gets submitted as the actual place/organization text.
  final String Function(T) displayString;
  /// What's shown for each row in the results list — defaults to
  /// [displayString], but pass a more detailed version (e.g. with the
  /// city in parentheses) when results can otherwise look identical,
  /// like two locations sharing a name in different cities.
  final String Function(T)? listLabel;
  final void Function(T) onSelected;
  final String? hintText;
  final String? initialText;
  final bool enabled;
  /// Optional external controller — pass one in if the parent screen also
  /// needs to read/clear the raw typed text (e.g. to fall back to free
  /// text when nothing in the directory matches yet).
  final TextEditingController? controller;
  /// Fires on every keystroke (not just on selection) — use this to clear
  /// a previously-picked value when the person starts typing something
  /// different instead of choosing from the list.
  final void Function(String)? onTextChanged;

  @override
  State<SearchPickerField<T>> createState() => _SearchPickerFieldState<T>();
}

class _SearchPickerFieldState<T> extends State<SearchPickerField<T>> {
  late final TextEditingController _controller =
      widget.controller ?? TextEditingController(text: widget.initialText ?? '');
  Timer? _debounce;
  List<T> _results = [];
  bool _loading = false;
  bool _showResults = false;

  @override
  void dispose() {
    _debounce?.cancel();
    if (widget.controller == null) _controller.dispose();
    super.dispose();
  }

  void _onChanged(String query) {
    widget.onTextChanged?.call(query);
    _debounce?.cancel();
    setState(() => _showResults = true);
    if (query.trim().isEmpty) {
      setState(() => _results = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      setState(() => _loading = true);
      try {
        final results = await widget.search(query.trim());
        if (mounted) setState(() => _results = results);
      } catch (_) {
        if (mounted) setState(() => _results = []);
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  void _select(T item) {
    setState(() {
      _controller.text = widget.displayString(item);
      _showResults = false;
      _results = [];
    });
    FocusScope.of(context).unfocus();
    widget.onSelected(item);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _controller,
          enabled: widget.enabled,
          decoration: InputDecoration(
            hintText: widget.hintText,
            suffixIcon: _loading
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 14, height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : const Icon(Icons.search, size: 18),
          ),
          onChanged: _onChanged,
          onTap: () => setState(() => _showResults = true),
        ),
        if (_showResults && _results.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 4),
            constraints: const BoxConstraints(maxHeight: 220),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.inkSoft.withOpacity(0.25)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: _results.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) => ListTile(
                dense: true,
                title: Text((widget.listLabel ?? widget.displayString)(_results[i])),
                onTap: () => _select(_results[i]),
              ),
            ),
          ),
      ],
    );
  }
}
