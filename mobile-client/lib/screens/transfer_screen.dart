import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/management_services.dart';
import '../store/app_state.dart';
import '../widgets/location_search_field.dart';
import 'barcode_scanner_screen.dart';
import 'transfer_detail_screen.dart';

/// One equipment row picked for the transfer — unlike the delivery-note
/// item rows, this keeps the actual [WarehouseItem] (id + barcode), since
/// the backend needs real item IDs to move them between locations.
class _TransferRow {
  WarehouseItem? item;
  final nameCtrl = TextEditingController();
  _TransferRow();
  void dispose() => nameCtrl.dispose();
}

class TransferScreen extends StatefulWidget {
  const TransferScreen({super.key});
  @override
  State<TransferScreen> createState() => _TransferScreenState();
}

class _TransferScreenState extends State<TransferScreen> {
  late WarehouseService _svc;

  final _fromCtrl = TextEditingController();
  final _toCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  int? _fromLocationId;
  int? _toLocationId;
  String _fromLocationName = '';
  String _toLocationName = '';

  final List<_TransferRow> _rows = [_TransferRow()];
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _svc = WarehouseService(context.read<ApiService>());
  }

  @override
  void dispose() {
    _fromCtrl.dispose();
    _toCtrl.dispose();
    _notesCtrl.dispose();
    for (final r in _rows) r.dispose();
    super.dispose();
  }

  void _addRow() => setState(() => _rows.add(_TransferRow()));

  void _removeRow(int i) => setState(() {
    _rows[i].dispose();
    _rows.removeAt(i);
    if (_rows.isEmpty) _rows.add(_TransferRow());
  });

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    if (_fromLocationId == null || _toLocationId == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.transferPickBothLocations)));
      return;
    }
    if (_fromLocationId == _toLocationId) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.transferSameLocation)));
      return;
    }
    final itemIds = _rows.map((r) => r.item?.id).whereType<int>().toSet().toList();
    if (itemIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.transferNoItems)));
      return;
    }
    setState(() => _submitting = true);
    try {
      final itemsSnapshot = _rows
          .where((r) => r.item != null)
          .map((r) => {'name': r.item!.name, 'barcode': r.item!.barcode, 'quantity': r.item!.quantity})
          .toList();
      final transfer = await _svc.createTransfer(
        fromLocationId: _fromLocationId!,
        toLocationId: _toLocationId!,
        itemIds: itemIds,
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      );
      if (!mounted) return;
      final creatorName = context.read<AppState>().currentUser?.fullName ?? '';
      final fromName = _fromLocationName;
      final toName = _toLocationName;
      setState(() {
        _fromCtrl.clear(); _toCtrl.clear(); _notesCtrl.clear();
        _fromLocationId = null; _toLocationId = null;
        _fromLocationName = ''; _toLocationName = '';
        for (final r in _rows) r.dispose();
        _rows
          ..clear()
          ..add(_TransferRow());
      });
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TransferDetailScreen(
        transfer: transfer,
        fromLocationName: fromName,
        toLocationName: toName,
        items: itemsSnapshot,
        createdByName: creatorName,
      )));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${l10n.transferFailed}: $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 90),
        children: [
          Text(l10n.transferTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
          const SizedBox(height: 12),

          LocationSearchField(
            controller: _fromCtrl,
            label: l10n.transferFrom,
            onSelected: (loc) => setState(() { _fromLocationId = loc.id; _fromLocationName = loc.name; }),
          ),
          const SizedBox(height: 10),
          LocationSearchField(
            controller: _toCtrl,
            label: l10n.transferTo,
            onSelected: (loc) => setState(() { _toLocationId = loc.id; _toLocationName = loc.name; }),
          ),
          const SizedBox(height: 16),

          Text(l10n.transferEquipment, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 6),
          ...List.generate(_rows.length, (i) => _TransferRowWidget(
            row: _rows[i],
            fromLocationId: _fromLocationId,
            onDelete: _rows.length > 1 ? () => _removeRow(i) : null,
          )),
          TextButton.icon(
            onPressed: _addRow,
            icon: const Icon(Icons.add, size: 18),
            label: Text(l10n.transferAddItem),
          ),
          const SizedBox(height: 12),

          TextField(
            controller: _notesCtrl,
            maxLines: 3,
            decoration: InputDecoration(labelText: l10n.transferNotes, border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 20),

          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.swap_horiz),
            label: Text(l10n.transferSubmit),
            style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
          ),
        ],
      ),
    );
  }
}

/// One row: barcode scan / name search to pick a real WarehouseItem
/// from the *source* location's stock.
class _TransferRowWidget extends StatefulWidget {
  const _TransferRowWidget({required this.row, required this.fromLocationId, this.onDelete});
  final _TransferRow row;
  final int? fromLocationId;
  final VoidCallback? onDelete;

  @override
  State<_TransferRowWidget> createState() => _TransferRowWidgetState();
}

class _TransferRowWidgetState extends State<_TransferRowWidget> {
  Timer? _debounce;
  List<WarehouseItem> _results = [];
  bool _loading = false;
  bool _showResults = false;
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      if (!_focusNode.hasFocus) {
        Future.delayed(const Duration(milliseconds: 200), () {
          if (mounted && !_focusNode.hasFocus) setState(() => _showResults = false);
        });
      }
    });
    widget.row.nameCtrl.addListener(_onChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _focusNode.dispose();
    widget.row.nameCtrl.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    final q = widget.row.nameCtrl.text.trim();
    _debounce?.cancel();
    if (q.length < 2) {
      setState(() { _results = []; _showResults = false; });
      return;
    }
    setState(() { _loading = true; _showResults = true; });
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(q));
  }

  Future<void> _search(String q) async {
    try {
      final svc = WarehouseService(context.read<ApiService>());
      final items = await svc.listItems(q: q, locationId: widget.fromLocationId);
      if (mounted) setState(() { _results = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _results = []; _loading = false; });
    }
  }

  void _select(WarehouseItem item) {
    widget.row.item = item;
    widget.row.nameCtrl.text = item.name;
    setState(() { _results = []; _showResults = false; });
    _focusNode.unfocus();
  }

  Future<void> _scanBarcode() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
    );
    if (code == null || code.isEmpty || !mounted) return;
    final svc = WarehouseService(context.read<ApiService>());
    final item = await svc.findByBarcode(code);
    if (!mounted) return;
    if (item != null) {
      _select(item);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Barcode $code not found'), backgroundColor: Colors.orange.shade700),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: TextField(
              controller: widget.row.nameCtrl,
              focusNode: _focusNode,
              decoration: InputDecoration(
                isDense: true,
                hintText: l10n.transferItemHint,
                border: const OutlineInputBorder(),
                suffixIcon: _loading
                    ? const Padding(padding: EdgeInsets.all(8), child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)))
                    : (widget.row.item != null ? const Icon(Icons.check_circle, color: Colors.green, size: 18) : null),
              ),
            ),
          ),
          IconButton(icon: const Icon(Icons.qr_code_scanner), onPressed: _scanBarcode, color: AppColors.primary),
          IconButton(
            icon: const Icon(Icons.close, size: 18),
            onPressed: widget.onDelete,
            color: widget.onDelete != null ? Colors.red.shade300 : Colors.transparent,
          ),
        ]),
        if (widget.row.item?.warehouseLocationName != null)
          Padding(
            padding: const EdgeInsets.only(left: 4, top: 2),
            child: Text('${l10n.transferCurrentLocation}: ${widget.row.item!.warehouseLocationName}', style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
          ),
        if (_showResults && _results.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 2),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(8),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.07), blurRadius: 6, offset: const Offset(0, 2))],
            ),
            constraints: const BoxConstraints(maxHeight: 200),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: _results.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final item = _results[i];
                return ListTile(
                  dense: true,
                  leading: const Icon(Icons.inventory_2_outlined, size: 16, color: Colors.grey),
                  title: Text(item.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  subtitle: Text(item.barcode, style: const TextStyle(fontSize: 11, fontFamily: 'Courier')),
                  trailing: Text('${item.quantity}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  onTap: () => _select(item),
                );
              },
            ),
          ),
      ]),
    );
  }
}
