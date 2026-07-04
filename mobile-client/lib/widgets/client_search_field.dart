import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/api_service.dart';

/// Combined search result from phonebook or locations
class _SearchResult {
  final String name;
  final String? subtitle;   // company / city
  final String? role;       // position from phonebook
  final String? phone;
  final String source;      // 'contact' | 'location'

  _SearchResult({
    required this.name,
    this.subtitle,
    this.role,
    this.phone,
    required this.source,
  });
}

/// Search field that queries phonebook contacts (+ optionally locations)
/// and auto-fills role/phone on selection.
class ClientSearchField extends StatefulWidget {
  const ClientSearchField({
    super.key,
    required this.controller,
    required this.label,
    this.hintText,
    this.includeLocations = false,
    this.onSelected,
    this.textInputAction,
  });

  final TextEditingController controller;
  final String label;
  final String? hintText;
  final bool includeLocations;
  final void Function({String? role, String? phone})? onSelected;
  final TextInputAction? textInputAction;

  @override
  State<ClientSearchField> createState() => _ClientSearchFieldState();
}

class _ClientSearchFieldState extends State<ClientSearchField> {
  Timer? _debounce;
  List<_SearchResult> _results = [];
  bool _loading = false;
  bool _showResults = false;
  bool _selecting = false;   // prevents listener re-triggering search after selection
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      if (!_focusNode.hasFocus) {
        // Delay hiding: tapping a result row unfocuses the TextField first,
        // which used to hide the list before onTap could register the selection.
        Future.delayed(const Duration(milliseconds: 200), () {
          if (mounted && !_focusNode.hasFocus) {
            setState(() => _showResults = false);
          }
        });
      }
    });
    widget.controller.addListener(_onChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _focusNode.dispose();
    widget.controller.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    if (_selecting) return;   // ← ignore programmatic text change
    final q = widget.controller.text.trim();
    _debounce?.cancel();
    if (q.length < 2) {
      setState(() { _results = []; _showResults = false; });
      return;
    }
    setState(() { _loading = true; _showResults = true; });
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(q));
  }

  Future<void> _search(String q) async {
    final api = context.read<ApiService>();
    final results = <_SearchResult>[];

    try {
      // 1. Phonebook contacts
      final data = await api.get('/phonebook', query: {'q': q, 'limit': '8'});
      final contacts = (data as List<dynamic>? ?? []);
      for (final c in contacts) {
        final j = c as Map<String, dynamic>;
        final fn = j['firstName'] as String? ?? '';
        final ln = j['lastName'] as String? ?? '';
        results.add(_SearchResult(
          name: '$fn $ln'.trim(),
          subtitle: j['company'] as String?,
          role: j['position'] as String?,
          phone: j['phone'] as String?,
          source: 'contact',
        ));
      }
    } catch (_) {}

    if (widget.includeLocations) {
      try {
        // 2. Locations
        final locsData = await api.get('/locations', query: {'q': q, 'limit': '5'});
        final locs = (locsData as List<dynamic>? ?? []);
        for (final l in locs) {
          final j = l as Map<String, dynamic>;
          results.add(_SearchResult(
            name: j['name'] as String? ?? '',
            subtitle: j['city']?['name'] as String?,
            source: 'location',
          ));
        }
      } catch (_) {}
    }

    if (mounted) setState(() { _results = results; _loading = false; });
  }

  void _select(_SearchResult r) {
    _selecting = true;
    widget.controller.text = r.name;
    _selecting = false;
    _debounce?.cancel();
    setState(() { _results = []; _showResults = false; _loading = false; });
    _focusNode.unfocus();
    widget.onSelected?.call(role: r.role, phone: r.phone);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: widget.controller,
          focusNode: _focusNode,
          textInputAction: widget.textInputAction ?? TextInputAction.next,
          decoration: InputDecoration(
            labelText: widget.label,
            hintText: widget.hintText,
            suffixIcon: _loading
                ? const Padding(padding: EdgeInsets.all(12), child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)))
                : widget.controller.text.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () {
                        widget.controller.clear();
                        setState(() { _results = []; _showResults = false; });
                      })
                    : const Icon(Icons.search, size: 18, color: Colors.grey),
          ),
        ),
        if (_showResults && _results.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 2),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(10),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 8, offset: const Offset(0, 3))],
            ),
            constraints: const BoxConstraints(maxHeight: 220),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: _results.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final r = _results[i];
                return ListTile(
                  dense: true,
                  leading: Icon(
                    r.source == 'contact' ? Icons.person_outline : Icons.location_on_outlined,
                    size: 18,
                    color: AppColors.primary,
                  ),
                  title: Text(r.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  subtitle: (r.subtitle != null || r.role != null)
                      ? Text([if (r.subtitle != null) r.subtitle!, if (r.role != null) r.role!].join(' • '), style: const TextStyle(fontSize: 12))
                      : null,
                  onTap: () => _select(r),
                );
              },
            ),
          ),
      ],
    );
  }
}
