import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/api_service.dart';
import '../services/management_services.dart';

/// One row in the delivery note items table.
/// Provides:
///  - Qty field
///  - Item name with warehouse autocomplete (≥2 chars) + barcode scan button
///  - Notes field
///  - Delete button
class ItemRowWidget extends StatefulWidget {
  const ItemRowWidget({
    super.key,
    required this.row,
    this.onDelete,
    this.onBarcodeScanned,
  });

  final ItemRow row;
  final VoidCallback? onDelete;
  /// Called after a successful barcode scan — parent rebuilds
  final VoidCallback? onBarcodeScanned;

  @override
  State<ItemRowWidget> createState() => _ItemRowWidgetState();
}

class _ItemRowWidgetState extends State<ItemRowWidget> {
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
    widget.row.nameCtrl.addListener(_onNameChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _focusNode.dispose();
    widget.row.nameCtrl.removeListener(_onNameChanged);
    super.dispose();
  }

  void _onNameChanged() {
    final q = widget.row.nameCtrl.text.trim();
    _debounce?.cancel();
    if (q.length < 2) {
      setState(() { _results = []; _showResults = false; });
      return;
    }
    setState(() { _loading = true; _showResults = true; });
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(q));
  }

  Future<void> _search(String q) async {
    try {
      final api = context.read<ApiService>();
      final svc = WarehouseService(api);
      final items = await svc.listItems(q: q, mainOnly: true);
      if (mounted) setState(() { _results = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _results = []; _loading = false; });
    }
  }

  void _selectItem(WarehouseItem item) {
    widget.row.nameCtrl.text = item.name;
    setState(() { _results = []; _showResults = false; });
    _focusNode.unfocus();
  }

  Future<void> _scanBarcode() async {
    // Navigate to barcode scanner
    final result = await Navigator.pushNamed(context, '/barcode-scanner');
    if (result is String && result.isNotEmpty) {
      _findByBarcode(result);
    }
  }

  Future<void> _findByBarcode(String barcode) async {
    try {
      final api = context.read<ApiService>();
      final svc = WarehouseService(api);
      final item = await svc.findByBarcode(barcode);
      if (item != null && mounted) {
        setState(() { widget.row.nameCtrl.text = item.name; });
        widget.onBarcodeScanned?.call();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Found: ${item.name}'), duration: const Duration(seconds: 2)),
        );
      } else if (mounted) {
        // Barcode not in warehouse — just put the barcode in name field
        setState(() { widget.row.nameCtrl.text = barcode; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Barcode $barcode not in warehouse — entered manually'),
            backgroundColor: Colors.orange.shade700, duration: const Duration(seconds: 3)),
        );
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Row(children: [
            // Quantity
            SizedBox(
              width: 46,
              child: TextField(
                controller: widget.row.qtyCtrl,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                decoration: const InputDecoration(
                  isDense: true,
                  contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                ),
              ),
            ),
            const SizedBox(width: 6),
            // Item name with search
            Expanded(
              child: TextField(
                controller: widget.row.nameCtrl,
                focusNode: _focusNode,
                decoration: InputDecoration(
                  isDense: true,
                  hintText: 'Item name…',
                  contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                  suffixIcon: _loading
                      ? const Padding(padding: EdgeInsets.all(8), child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)))
                      : null,
                ),
              ),
            ),
            const SizedBox(width: 4),
            // Barcode scan button
            SizedBox(
              width: 32,
              child: IconButton(
                icon: const Icon(Icons.qr_code_scanner, size: 18),
                onPressed: _scanBarcode,
                padding: EdgeInsets.zero,
                color: AppColors.primary,
                tooltip: 'Scan barcode',
              ),
            ),
            // Notes
            SizedBox(
              width: 72,
              child: TextField(
                controller: widget.row.notesCtrl,
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: 'Notes',
                  contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                ),
              ),
            ),
            // Delete
            SizedBox(
              width: 28,
              child: IconButton(
                icon: const Icon(Icons.close, size: 16),
                onPressed: widget.onDelete,
                color: widget.onDelete != null ? Colors.red.shade300 : Colors.transparent,
                padding: EdgeInsets.zero,
              ),
            ),
          ]),
        ),
        // Warehouse suggestions dropdown
        if (_showResults && _results.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(8),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.07), blurRadius: 6, offset: const Offset(0, 2))],
              ),
              constraints: const BoxConstraints(maxHeight: 180),
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
                    subtitle: item.description != null
                        ? Text(item.description!, style: const TextStyle(fontSize: 11))
                        : null,
                    trailing: Text('${item.quantity}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    onTap: () => _selectItem(item),
                  );
                },
              ),
            ),
          ),
        const Divider(height: 1),
      ],
    );
  }
}

/// Data model for one item row
class ItemRow {
  final qtyCtrl   = TextEditingController(text: '1');
  final nameCtrl  = TextEditingController();
  final notesCtrl = TextEditingController();

  ItemRow({int quantity = 1, String name = '', String notes = ''}) {
    qtyCtrl.text   = '$quantity';
    nameCtrl.text  = name;
    notesCtrl.text = notes;
  }

  void dispose() {
    qtyCtrl.dispose();
    nameCtrl.dispose();
    notesCtrl.dispose();
  }
}
