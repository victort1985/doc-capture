import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/api_service.dart';
import '../services/field_cache_service.dart';

class PhoneContact {
  final int id;
  final String name;
  final String? phone;
  final String? email;
  final String? company;

  PhoneContact({required this.id, required this.name, this.phone, this.email, this.company});

  factory PhoneContact.fromJson(Map<String, dynamic> j) => PhoneContact(
        id: j['id'],
        name: j['name'] ?? '',
        phone: j['phone'],
        email: j['email'],
        company: j['company'],
      );
}

/// A text field that:
///  1. Shows recent cached values as suggestions
///  2. Searches the phone book as user types (≥2 chars)
///  3. On selection — calls [onContactSelected] with matched contact so caller
///     can auto-fill related fields (phone, email, etc.)
///
/// [fieldKey]           — unique key for caching (e.g. 'deliveryNote.clientName')
/// [controller]         — the TextEditingController
/// [label]              — field label
/// [onContactSelected]  — called when user picks a contact
/// [contactFilter]      — optional filter: 'supplier', 'client', or null = all
class PhoneBookSearchField extends StatefulWidget {
  const PhoneBookSearchField({
    super.key,
    required this.fieldKey,
    required this.controller,
    required this.label,
    this.onContactSelected,
    this.contactFilter,
    this.textInputAction,
    this.onSubmitted,
  });

  final String fieldKey;
  final TextEditingController controller;
  final String label;
  final void Function(PhoneContact contact)? onContactSelected;
  final String? contactFilter; // 'supplier' | 'client' | null
  final TextInputAction? textInputAction;
  final void Function(String)? onSubmitted;

  @override
  State<PhoneBookSearchField> createState() => _PhoneBookSearchFieldState();
}

class _PhoneBookSearchFieldState extends State<PhoneBookSearchField> {
  final _focus = FocusNode();
  final _layerLink = LayerLink();
  OverlayEntry? _overlay;

  List<String> _cached = [];
  List<PhoneContact> _contacts = [];
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _loadCache();
    widget.controller.addListener(_onTextChanged);
    _focus.addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    _removeOverlay();
    widget.controller.removeListener(_onTextChanged);
    _focus.removeListener(_onFocusChanged);
    _focus.dispose();
    super.dispose();
  }

  Future<void> _loadCache() async {
    final cached = await FieldCacheService.instance.recent(widget.fieldKey);
    if (mounted) setState(() => _cached = cached);
  }

  void _onFocusChanged() {
    if (_focus.hasFocus) {
      if (widget.controller.text.isEmpty && _cached.isNotEmpty) {
        _showCachedSuggestions();
      }
    } else {
      Future.delayed(const Duration(milliseconds: 150), _removeOverlay);
    }
  }

  void _onTextChanged() {
    final q = widget.controller.text;
    if (q.isEmpty) {
      if (_cached.isNotEmpty && _focus.hasFocus) _showCachedSuggestions();
      else _removeOverlay();
      return;
    }
    if (q.length >= 2) _searchContacts(q);
    else _removeOverlay();
  }

  Future<void> _searchContacts(String q) async {
    setState(() => _searching = true);
    try {
      final api = context.read<ApiService>();
      final params = '?q=${Uri.encodeComponent(q)}${widget.contactFilter != null ? "&type=${widget.contactFilter}" : ""}';
      final data = await api.get('/phonebook/search$params') as List? ?? [];
      final contacts = data.map((j) => PhoneContact.fromJson(j as Map<String, dynamic>)).toList();
      if (mounted) {
        setState(() { _contacts = contacts; _searching = false; });
        if (contacts.isNotEmpty) _showContactSuggestions();
        else _removeOverlay();
      }
    } catch (_) {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _showCachedSuggestions() {
    _removeOverlay();
    if (_cached.isEmpty) return;
    _overlay = _buildOverlay(
      children: _cached.map((val) => _SuggestionTile(
        leading: const Icon(Icons.history, size: 16, color: AppColors.inkSoft),
        title: val,
        onTap: () {
          widget.controller.text = val;
          widget.controller.selection = TextSelection.fromPosition(TextPosition(offset: val.length));
          _removeOverlay();
        },
      )).toList(),
    );
    Overlay.of(context).insert(_overlay!);
  }

  void _showContactSuggestions() {
    _removeOverlay();
    if (_contacts.isEmpty) return;
    _overlay = _buildOverlay(
      children: _contacts.map((c) => _SuggestionTile(
        leading: const Icon(Icons.person_outline, size: 16, color: AppColors.inkSoft),
        title: c.name,
        subtitle: [c.phone, c.company].whereType<String>().join(' · '),
        onTap: () {
          widget.controller.text = c.name;
          widget.controller.selection = TextSelection.fromPosition(TextPosition(offset: c.name.length));
          FieldCacheService.instance.save(widget.fieldKey, c.name);
          widget.onContactSelected?.call(c);
          _removeOverlay();
        },
      )).toList(),
    );
    Overlay.of(context).insert(_overlay!);
  }

  OverlayEntry _buildOverlay({required List<Widget> children}) {
    final renderBox = context.findRenderObject() as RenderBox;
    final size = renderBox.size;
    return OverlayEntry(
      builder: (_) => Positioned(
        width: size.width,
        child: CompositedTransformFollower(
          link: _layerLink,
          showWhenUnlinked: false,
          offset: Offset(0, size.height + 2),
          child: Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(8),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220),
              child: ListView(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                children: children,
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _removeOverlay() {
    _overlay?.remove();
    _overlay = null;
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: TextField(
        controller: widget.controller,
        focusNode: _focus,
        textInputAction: widget.textInputAction,
        onSubmitted: (v) {
          FieldCacheService.instance.save(widget.fieldKey, v);
          widget.onSubmitted?.call(v);
        },
        decoration: InputDecoration(
          labelText: widget.label,
          suffixIcon: _searching
              ? const SizedBox(width: 16, height: 16, child: Padding(padding: EdgeInsets.all(10), child: CircularProgressIndicator(strokeWidth: 2)))
              : null,
        ),
      ),
    );
  }
}

class _SuggestionTile extends StatelessWidget {
  const _SuggestionTile({required this.title, required this.onTap, this.leading, this.subtitle});
  final String title;
  final String? subtitle;
  final Widget? leading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      leading: leading,
      title: Text(title, style: const TextStyle(fontSize: 13)),
      subtitle: subtitle != null ? Text(subtitle!, style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)) : null,
      onTap: onTap,
    );
  }
}
