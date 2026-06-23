import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/management_services.dart';

class WarehouseScreen extends StatefulWidget {
  const WarehouseScreen({super.key});
  @override
  State<WarehouseScreen> createState() => _WarehouseScreenState();
}

class _WarehouseScreenState extends State<WarehouseScreen> {
  late WarehouseService _svc;
  List<WarehouseItem> _items = [];
  List<WarehouseCategory> _categories = [];
  int? _selectedCategoryId;
  String _query = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _svc = WarehouseService(context.read<ApiService>());
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final cats = await _svc.listCategories();
      final items = await _svc.listItems(categoryId: _selectedCategoryId, q: _query);
      if (mounted) setState(() { _categories = cats; _items = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _printPdf({List<WarehouseItem>? selection}) async {
    final l10n = AppLocalizations.of(context)!;
    final rows = selection ?? _items;
    final pdf = pw.Document();
    pdf.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      build: (c) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Text(l10n.warehouseInventoryReport, style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 8),
        pw.Text('${DateTime.now().toLocal().toString().substring(0, 16)}', style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey600)),
        pw.SizedBox(height: 14),
        pw.Table.fromTextArray(
          headers: ['#', l10n.warehouseName, l10n.warehouseBarcode, l10n.warehouseCategory, l10n.warehouseQty, l10n.warehouseUnit, l10n.warehouseLocation],
          data: rows.asMap().entries.map((e) => [
            '${e.key + 1}',
            e.value.name,
            e.value.barcode,
            e.value.category?.name ?? '—',
            '${e.value.quantity}',
            e.value.unit ?? '—',
            e.value.location ?? '—',
          ]).toList(),
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
          cellStyle: const pw.TextStyle(fontSize: 9),
        ),
      ]),
    ));
    await Printing.layoutPdf(onLayout: (_) => pdf.save());
  }

  void _showItemDetail(WarehouseItem item) async {
    final l10n = AppLocalizations.of(context)!;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => _ItemDetailSheet(item: item, svc: _svc, onRefresh: _load),
    );
  }

  Future<void> _showAddItemDialog() async {
    final l10n = AppLocalizations.of(context)!;
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final unitCtrl = TextEditingController();
    final locCtrl  = TextEditingController();
    int? catId;
    final barcode  = await _svc.generateBarcode();
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSt) => AlertDialog(
        title: Text(l10n.warehouseAddItem),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          // Barcode display (text, copyable)
          GestureDetector(
            onTap: () {
              Clipboard.setData(ClipboardData(text: barcode));
              ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Barcode copied')));
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(6)),
              child: Column(children: [
                Text(barcode, style: const TextStyle(fontFamily: 'monospace', fontSize: 14, fontWeight: FontWeight.w700, letterSpacing: 2)),
                const Text('tap to copy', style: TextStyle(fontSize: 10, color: AppColors.inkSoft)),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          TextField(controller: nameCtrl, decoration: InputDecoration(labelText: l10n.warehouseName)),
          TextField(controller: descCtrl, decoration: InputDecoration(labelText: l10n.warehouseDescription)),
          DropdownButtonFormField<int>(
            value: catId,
            hint: Text(l10n.warehouseCategory),
            items: _categories.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))).toList(),
            onChanged: (v) => setSt(() => catId = v),
          ),
          TextField(controller: unitCtrl, decoration: InputDecoration(labelText: l10n.warehouseUnit)),
          TextField(controller: locCtrl, decoration: InputDecoration(labelText: l10n.warehouseLocation)),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () async {
              if (nameCtrl.text.trim().isEmpty) return;
              await _svc.createItem({
                'name': nameCtrl.text.trim(),
                'barcode': barcode,
                if (descCtrl.text.isNotEmpty) 'description': descCtrl.text.trim(),
                if (catId != null) 'categoryId': catId,
                if (unitCtrl.text.isNotEmpty) 'unit': unitCtrl.text.trim(),
                if (locCtrl.text.isNotEmpty) 'location': locCtrl.text.trim(),
              });
              if (ctx.mounted) Navigator.pop(ctx);
              _load();
            },
            child: Text(l10n.calendarSave),
          ),
        ],
      )),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(children: [
        // Toolbar
        Padding(
          padding: const EdgeInsets.all(10),
          child: Row(children: [
            Expanded(
              child: TextField(
                decoration: InputDecoration(
                  hintText: l10n.warehouseSearch,
                  prefixIcon: const Icon(Icons.search, size: 18),
                  isDense: true,
                ),
                onChanged: (v) { _query = v; _load(); },
              ),
            ),
            const SizedBox(width: 8),
            IconButton.outlined(onPressed: () => _printPdf(), icon: const Icon(Icons.picture_as_pdf_outlined), tooltip: l10n.warehousePrint),
          ]),
        ),
        // Category filter
        if (_categories.isNotEmpty)
          SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              children: [
                _CatChip(label: l10n.warehouseAll, selected: _selectedCategoryId == null, onTap: () { _selectedCategoryId = null; _load(); }),
                ..._categories.map((c) => _CatChip(label: c.name, selected: _selectedCategoryId == c.id, onTap: () { _selectedCategoryId = c.id; _load(); })),
              ],
            ),
          ),
        const SizedBox(height: 4),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _items.isEmpty
                  ? Center(child: Text(l10n.warehouseEmpty, style: const TextStyle(color: AppColors.inkSoft)))
                  : ListView.separated(
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (_, i) {
                        final item = _items[i];
                        return ListTile(
                          onTap: () => _showItemDetail(item),
                          title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text('${item.barcode}${item.category != null ? ' · ${item.category!.name}' : ''}'),
                          trailing: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Text('${item.quantity}', style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 16,
                              color: item.quantity == 0 ? Colors.red : AppColors.primary,
                            )),
                            if (item.unit != null) Text(item.unit!, style: const TextStyle(fontSize: 10, color: AppColors.inkSoft)),
                          ]),
                        );
                      },
                    ),
        ),
      ]),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddItemDialog,
        child: const Icon(Icons.add),
      ),
    );
  }
}

// ── Item detail sheet (barcode + transactions) ────────────────────────────────

class _ItemDetailSheet extends StatefulWidget {
  const _ItemDetailSheet({required this.item, required this.svc, required this.onRefresh});
  final WarehouseItem item;
  final WarehouseService svc;
  final VoidCallback onRefresh;
  @override
  State<_ItemDetailSheet> createState() => _ItemDetailSheetState();
}

class _ItemDetailSheetState extends State<_ItemDetailSheet> {
  List<WarehouseTransaction> _txs = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadTxs();
  }

  Future<void> _loadTxs() async {
    final txs = await widget.svc.listTransactions(widget.item.id);
    if (mounted) setState(() { _txs = txs; _loading = false; });
  }

  Future<void> _addTx(BuildContext context, String type) async {
    final l10n = AppLocalizations.of(context)!;
    final qtyCtrl = TextEditingController(text: '1');
    final reasonCtrl = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(type == 'in' ? l10n.warehouseIn : l10n.warehouseOut),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: qtyCtrl, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.warehouseQty)),
          TextField(controller: reasonCtrl, decoration: InputDecoration(labelText: l10n.warehouseReason)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () async {
              final qty = int.tryParse(qtyCtrl.text);
              if (qty == null || qty <= 0) return;
              await widget.svc.addTransaction(widget.item.id, type, qty, reason: reasonCtrl.text.isNotEmpty ? reasonCtrl.text : null);
              if (context.mounted) Navigator.pop(context);
              _loadTxs();
              widget.onRefresh();
            },
            child: Text(l10n.calendarSave),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final item = widget.item;
    return Column(children: [
      const SizedBox(height: 8),
      Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            if (item.category != null) Text(item.category!.name, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
          ])),
          // Barcode text
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(6)),
            child: Text(item.barcode, style: const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
          ),
        ]),
      ),
      // Stock info
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Row(children: [
          _StatBox(label: l10n.warehouseQty, value: '${item.quantity}${item.unit != null ? ' ${item.unit}' : ''}', color: item.quantity == 0 ? Colors.red : AppColors.primary),
          const SizedBox(width: 8),
          if (item.location != null) _StatBox(label: l10n.warehouseLocation, value: item.location!),
        ]),
      ),
      const SizedBox(height: 12),
      // In/Out buttons
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Row(children: [
          Expanded(child: OutlinedButton.icon(
            onPressed: () => _addTx(context, 'in'),
            icon: const Icon(Icons.add, size: 18),
            label: Text(l10n.warehouseIn),
            style: OutlinedButton.styleFrom(foregroundColor: Colors.green),
          )),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton.icon(
            onPressed: () => _addTx(context, 'out'),
            icon: const Icon(Icons.remove, size: 18),
            label: Text(l10n.warehouseOut),
            style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
          )),
        ]),
      ),
      const Divider(height: 24),
      Expanded(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _txs.isEmpty
                ? Center(child: Text(l10n.warehouseNoTransactions, style: const TextStyle(color: AppColors.inkSoft)))
                : ListView.separated(
                    itemCount: _txs.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final tx = _txs[i];
                      final isIn = tx.type == 'in';
                      return ListTile(
                        dense: true,
                        leading: Icon(isIn ? Icons.arrow_downward : Icons.arrow_upward,
                          color: isIn ? Colors.green : Colors.red, size: 18),
                        title: Text('${isIn ? '+' : '-'}${tx.quantity}${item.unit != null ? ' ${item.unit}' : ''}${tx.reason != null ? ' — ${tx.reason}' : ''}'),
                        subtitle: Text('${tx.byUsername ?? '?'} · ${tx.createdAt.substring(0, 16)}', style: const TextStyle(fontSize: 11)),
                      );
                    },
                  ),
      ),
    ]);
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(color: (color ?? AppColors.primary).withOpacity(0.10), borderRadius: BorderRadius.circular(8)),
    child: Column(children: [
      Text(value, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: color ?? AppColors.primary)),
      Text(label, style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
    ]),
  );
}

class _CatChip extends StatelessWidget {
  const _CatChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: FilterChip(label: Text(label, style: const TextStyle(fontSize: 12)), selected: selected, onSelected: (_) => onTap()),
  );
}

// ── Warehouse screen end ──────────────────────────────────────────────────────
