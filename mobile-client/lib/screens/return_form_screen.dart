import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/delivery_notes_service.dart';
import '../services/returns_service.dart';
import '../widgets/search_picker_field.dart';

class ReturnFormScreen extends StatefulWidget {
  const ReturnFormScreen({super.key});
  @override
  State<ReturnFormScreen> createState() => _ReturnFormScreenState();
}

class _ReturnFormScreenState extends State<ReturnFormScreen> {
  final _clientController = TextEditingController();
  final _emailController = TextEditingController();
  final _reasonController = TextEditingController();
  final List<(TextEditingController, TextEditingController, TextEditingController)> _items = [];
  int? _deliveryNoteId;
  String? _deliveryNoteLabel;
  bool _saving = false;
  List<DeliveryNote>? _notesCache;

  @override
  void initState() {
    super.initState();
    _addItem();
  }

  void _addItem() {
    setState(() => _items.add((TextEditingController(), TextEditingController(text: '1'), TextEditingController())));
  }

  Future<List<DeliveryNote>> _searchNotes(String query) async {
    _notesCache ??= await DeliveryNotesService(context.read<ApiService>()).list();
    final q = query.toLowerCase();
    return _notesCache!
        .where((n) => (n.noteNumber ?? '').toLowerCase().contains(q) || (n.clientName ?? '').toLowerCase().contains(q))
        .toList();
  }

  Future<void> _pickDeliveryNote() async {
    final l10n = AppLocalizations.of(context)!;
    final picked = await showModalBottomSheet<DeliveryNote>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.returnPickDeliveryNoteTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 12),
            SearchPickerField<DeliveryNote>(
              search: _searchNotes,
              displayString: (n) => n.noteNumber ?? '#${n.id}',
              listLabel: (n) => '${n.noteNumber ?? '#${n.id}'} · ${n.clientName ?? ''}',
              hintText: l10n.returnPickDeliveryNoteHint,
              onSelected: (n) => Navigator.of(ctx).pop(n),
            ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    setState(() {
      _deliveryNoteId = picked.id;
      _deliveryNoteLabel = picked.noteNumber ?? '#${picked.id}';
      if (_clientController.text.trim().isEmpty && picked.clientName != null) _clientController.text = picked.clientName!;
    });
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;
    if (_deliveryNoteId == null || _clientController.text.trim().isEmpty || _reasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.returnFormInvalid)));
      return;
    }
    setState(() => _saving = true);
    try {
      final items = _items
          .where((i) => i.$1.text.trim().isNotEmpty)
          .map((i) => ReturnItem(
                name: i.$1.text.trim(),
                quantity: double.tryParse(i.$2.text) ?? 1,
                notes: i.$3.text.trim().isEmpty ? null : i.$3.text.trim(),
              ))
          .toList();
      await ReturnsService(context.read<ApiService>()).create(
        deliveryNoteId: _deliveryNoteId!,
        clientName: _clientController.text.trim(),
        clientEmail: _emailController.text.trim(),
        reason: _reasonController.text.trim(),
        items: items,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.returnSaveError)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.returnNew)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          OutlinedButton.icon(
            onPressed: _pickDeliveryNote,
            icon: const Icon(Icons.assignment_outlined, size: 18),
            label: Text(_deliveryNoteLabel == null ? l10n.returnPickDeliveryNoteTitle : '${l10n.returnPickDeliveryNoteTitle}: $_deliveryNoteLabel'),
          ),
          const SizedBox(height: 14),
          TextField(controller: _clientController, decoration: InputDecoration(labelText: l10n.quoteClientName)),
          const SizedBox(height: 10),
          TextField(controller: _emailController, decoration: InputDecoration(labelText: l10n.quoteClientEmail)),
          const SizedBox(height: 10),
          TextField(controller: _reasonController, decoration: InputDecoration(labelText: l10n.returnReason), maxLines: 2),
          const SizedBox(height: 16),
          Text(l10n.returnItems, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ..._items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  Expanded(flex: 2, child: TextField(controller: item.$1, decoration: InputDecoration(labelText: l10n.returnItemName))),
                  const SizedBox(width: 8),
                  Expanded(child: TextField(controller: item.$2, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.quoteItemQty))),
                  const SizedBox(width: 8),
                  Expanded(flex: 2, child: TextField(controller: item.$3, decoration: InputDecoration(labelText: l10n.returnItemNotes))),
                ]),
              )),
          TextButton.icon(onPressed: _addItem, icon: const Icon(Icons.add), label: Text(l10n.quoteAddItem)),
          const SizedBox(height: 20),
          FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? '…' : l10n.quoteSave)),
        ],
      ),
    );
  }
}
