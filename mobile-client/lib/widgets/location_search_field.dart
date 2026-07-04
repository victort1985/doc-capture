import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/api_service.dart';

class LocationResult {
  final int id;
  final String name;
  final String? cityName;
  LocationResult({required this.id, required this.name, this.cityName});
}

/// Search-as-you-type picker over the shared Locations directory
/// (`/locations?q=`). Used to select which location's independent
/// warehouse to view, or as the from/to fields on an equipment transfer.
class LocationSearchField extends StatefulWidget {
  const LocationSearchField({
    super.key,
    required this.controller,
    required this.label,
    this.hintText,
    this.onSelected,
    this.textInputAction,
  });

  final TextEditingController controller;
  final String label;
  final String? hintText;
  final void Function(LocationResult)? onSelected;
  final TextInputAction? textInputAction;

  @override
  State<LocationSearchField> createState() => _LocationSearchFieldState();
}

class _LocationSearchFieldState extends State<LocationSearchField> {
  Timer? _debounce;
  List<LocationResult> _results = [];
  bool _loading = false;
  bool _showResults = false;
  bool _selecting = false;
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      if (!_focusNode.hasFocus) {
        // Delay hiding so a tap on a result row has time to register
        // before the dropdown disappears (focus is lost on pointer-down).
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
    if (_selecting) return;
    final q = widget.controller.text.trim();
    _debounce?.cancel();
    if (q.isEmpty) {
      setState(() { _results = []; _showResults = false; });
      return;
    }
    setState(() { _loading = true; _showResults = true; });
    _debounce = Timer(const Duration(milliseconds: 250), () => _search(q));
  }

  Future<void> _search(String q) async {
    final api = context.read<ApiService>();
    try {
      final data = await api.get('/locations', query: {'q': q, 'limit': '10'});
      final locs = (data as List<dynamic>? ?? []).map((l) {
        final j = l as Map<String, dynamic>;
        return LocationResult(
          id: j['id'] as int,
          name: j['name'] as String? ?? '',
          cityName: j['city']?['name'] as String?,
        );
      }).toList();
      if (mounted) setState(() { _results = locs; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _results = []; _loading = false; });
    }
  }

  void _select(LocationResult r) {
    _selecting = true;
    widget.controller.text = r.name;
    _selecting = false;
    _debounce?.cancel();
    setState(() { _results = []; _showResults = false; _loading = false; });
    _focusNode.unfocus();
    widget.onSelected?.call(r);
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
                    : const Icon(Icons.location_on_outlined, size: 18, color: Colors.grey),
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
                  leading: const Icon(Icons.location_on_outlined, size: 18, color: AppColors.primary),
                  title: Text(r.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  subtitle: r.cityName != null ? Text(r.cityName!, style: const TextStyle(fontSize: 12)) : null,
                  onTap: () => _select(r),
                );
              },
            ),
          ),
      ],
    );
  }
}
