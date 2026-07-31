import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../app/theme.dart';
import '../services/api_service.dart';
import '../services/delivery_notes_service.dart';
import '../services/returns_service.dart';
import '../services/management_services.dart' show WarehouseItem, WarehouseService;
import '../widgets/search_picker_field.dart';

/// A mutable row (not a tuple, since the picked warehouse item needs
/// to update in place after the row already exists — plain records
/// can't do that once created).
class _ReturnItemRow {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController qtyController = TextEditingController(text: '1');
  final TextEditingController notesController = TextEditingController();
  int? warehouseItemId;
  String? warehouseItemLabel;
}

class ReturnFormScreen extends StatefulWidget {
  const ReturnFormScreen({super.key});
  @override
  State<ReturnFormScreen> createState() => _ReturnFormScreenState();
}

class _ReturnFormScreenState extends State<ReturnFormScreen> {
  final _clientController = TextEditingController();
  final _emailController = TextEditingController();
  final _reasonController = TextEditingController();
  final List<_ReturnItemRow> _items = [];
  int? _deliveryNoteId;
  String? _deliveryNoteLabel;
  bool _saving = false;
  List<DeliveryNote>? _notesCache;
  List<WarehouseItem>? _warehouseCache;

  @override
  void initState() {
    super.initState();
    _addItem();
  }

  void _addItem() {
    setState(() => _items.add(_ReturnItemRow()));
  }

  Future<List<DeliveryNote>> _searchNotes(String query) async {
    _notesCache ??= await DeliveryNotesService(context.read<ApiService>()).list();
    final q = query.toLowerCase();
    return _notesCache!
        .where((n) => (n.noteNumber ?? '').toLowerCase().contains(q) || (n.clientName ?? '').toLowerCase().contains(q))
        .toList();
  }

  Future<List<WarehouseItem>> _searchWarehouseItems(String query) async {
    _warehouseCache ??= await WarehouseService(context.read<ApiService>()).listItems();
    final q = query.toLowerCase();
    return _warehouseCache!
        .where((w) => w.name.toLowerCase().contains(q) || w.barcode.toLowerCase().contains(q))
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

  /// Linking a row to a warehouse item is what lets the backend
  /// automatically restock it when the return is created (see
  /// returns.service.ts — this was already wired server-side, just
  /// never had a picker on mobile to actually set it). Optional —
  /// a row can stay unlinked if there's no matching catalog item or
  /// the person doesn't want to restock automatically.
  Future<void> _pickWarehouseItem(_ReturnItemRow row) async {
    final l10n = AppLocalizations.of(context)!;
    final picked = await showModalBottomSheet<WarehouseItem>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.returnPickWarehouseItemTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 12),
            SearchPickerField<WarehouseItem>(
              search: _searchWarehouseItems,
              displayString: (w) => w.name,
              listLabel: (w) => '${w.name} · ${w.barcode} · ${l10n.returnWarehouseQtyInStock}: ${w.quantity}',
              hintText: l10n.returnPickWarehouseItemHint,
              onSelected: (w) => Navigator.of(ctx).pop(w),
            ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    setState(() {
      row.warehouseItemId = picked.id;
      row.warehouseItemLabel = picked.name;
      if (row.nameController.text.trim().isEmpty) row.nameController.text = picked.name;
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
          .where((row) => row.nameController.text.trim().isNotEmpty)
          .map((row) => ReturnItem(
                name: row.nameController.text.trim(),
                quantity: double.tryParse(row.qtyController.text) ?? 1,
                notes: row.notesController.text.trim().isEmpty ? null : row.notesController.text.trim(),
                warehouseItemId: row.warehouseItemId,
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
          ..._items.map((row) => Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(border: Border.all(color: AppColors.primaryWash), borderRadius: BorderRadius.circular(10)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(flex: 2, child: TextField(controller: row.nameController, decoration: InputDecoration(labelText: l10n.returnItemName))),
                      const SizedBox(width: 8),
                      Expanded(child: TextField(controller: row.qtyController, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.quoteItemQty))),
                    ]),
                    const SizedBox(height: 8),
                    TextField(controller: row.notesController, decoration: InputDecoration(labelText: l10n.returnItemNotes)),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => _pickWarehouseItem(row),
                      icon: Icon(row.warehouseItemId == null ? Icons.inventory_2_outlined : Icons.check_circle_outline, size: 16),
                      label: Text(
                        row.warehouseItemLabel == null
                            ? l10n.returnPickWarehouseItemTitle
                            : '${l10n.returnWarehouseItemLinked}: ${row.warehouseItemLabel}',
                        style: const TextStyle(fontSize: 12.5),
                        overflow: TextOverflow.ellipsis,
                      ),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 10)),
                    ),
                  ],
                ),
              )),
          TextButton.icon(onPressed: _addItem, icon: const Icon(Icons.add), label: Text(l10n.quoteAddItem)),
          const SizedBox(height: 20),
          FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? '…' : l10n.quoteSave)),
        ],
      ),
    );
  }
}
