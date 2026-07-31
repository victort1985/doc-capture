import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/invoices_service.dart';
import '../services/credit_notes_service.dart';
import '../services/debit_notes_service.dart';
import '../widgets/search_picker_field.dart';

enum CreditDebitKind { credit, debit }

/// Shared create form for credit notes and debit notes — same fields,
/// same invoice picker, same item-entry pattern (mirroring
/// QuotesScreen's item-row tuples), differing only in which endpoint
/// gets called and which label shows. Kept as one widget rather than
/// two near-identical ~150-line copies.
class CreditDebitFormScreen extends StatefulWidget {
  const CreditDebitFormScreen({super.key, required this.kind});
  final CreditDebitKind kind;

  @override
  State<CreditDebitFormScreen> createState() => _CreditDebitFormScreenState();
}

class _CreditDebitFormScreenState extends State<CreditDebitFormScreen> {
  final _clientController = TextEditingController();
  final _emailController = TextEditingController();
  final _reasonController = TextEditingController();
  final List<(TextEditingController, TextEditingController, TextEditingController)> _items = [];
  int? _invoiceId;
  String? _invoiceLabel;
  bool _saving = false;
  List<Invoice>? _invoicesCache;

  @override
  void initState() {
    super.initState();
    _addItem();
  }

  void _addItem() {
    setState(() => _items.add((TextEditingController(), TextEditingController(text: '1'), TextEditingController(text: '0'))));
  }

  Future<List<Invoice>> _searchInvoices(String query) async {
    _invoicesCache ??= await InvoicesService(context.read<ApiService>()).list();
    final q = query.toLowerCase();
    return _invoicesCache!
        .where((inv) => (inv.invoiceNumber ?? '').toLowerCase().contains(q) || inv.clientName.toLowerCase().contains(q))
        .toList();
  }

  Future<void> _pickInvoice() async {
    final l10n = AppLocalizations.of(context)!;
    final picked = await showModalBottomSheet<Invoice>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.creditDebitPickInvoiceTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 12),
            SearchPickerField<Invoice>(
              search: _searchInvoices,
              displayString: (inv) => inv.invoiceNumber ?? '#${inv.id}',
              listLabel: (inv) => '${inv.invoiceNumber ?? '#${inv.id}'} · ${inv.clientName} · ₪${inv.total.toStringAsFixed(2)}',
              hintText: l10n.creditDebitPickInvoiceHint,
              onSelected: (inv) => Navigator.of(ctx).pop(inv),
            ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    setState(() {
      _invoiceId = picked.id;
      _invoiceLabel = picked.invoiceNumber ?? '#${picked.id}';
      if (_clientController.text.trim().isEmpty) _clientController.text = picked.clientName;
    });
  }

  double get _total {
    double sum = 0;
    for (final (_, qtyC, priceC) in _items) {
      sum += (double.tryParse(qtyC.text) ?? 0) * (double.tryParse(priceC.text) ?? 0);
    }
    return sum;
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;
    if (_invoiceId == null || _clientController.text.trim().isEmpty || _reasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.creditDebitFormInvalid)));
      return;
    }
    setState(() => _saving = true);
    try {
      final items = _items
          .where((i) => i.$1.text.trim().isNotEmpty)
          .map((i) => CreditDebitItem(
                description: i.$1.text.trim(),
                quantity: double.tryParse(i.$2.text) ?? 1,
                unitPrice: double.tryParse(i.$3.text) ?? 0,
              ))
          .toList();
      if (widget.kind == CreditDebitKind.credit) {
        await CreditNotesService(context.read<ApiService>()).create(
          invoiceId: _invoiceId!,
          clientName: _clientController.text.trim(),
          clientEmail: _emailController.text.trim(),
          reason: _reasonController.text.trim(),
          items: items,
        );
      } else {
        await DebitNotesService(context.read<ApiService>()).create(
          invoiceId: _invoiceId!,
          clientName: _clientController.text.trim(),
          clientEmail: _emailController.text.trim(),
          reason: _reasonController.text.trim(),
          items: items,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.creditDebitSaveError)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isCredit = widget.kind == CreditDebitKind.credit;
    return Scaffold(
      appBar: AppBar(title: Text(isCredit ? l10n.creditNoteNew : l10n.debitNoteNew)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          OutlinedButton.icon(
            onPressed: _pickInvoice,
            icon: const Icon(Icons.receipt_long_outlined, size: 18),
            label: Text(_invoiceLabel == null ? l10n.creditDebitPickInvoiceTitle : '${l10n.creditDebitPickInvoiceTitle}: $_invoiceLabel'),
          ),
          const SizedBox(height: 14),
          TextField(controller: _clientController, decoration: InputDecoration(labelText: l10n.quoteClientName)),
          const SizedBox(height: 10),
          TextField(controller: _emailController, decoration: InputDecoration(labelText: l10n.quoteClientEmail)),
          const SizedBox(height: 10),
          TextField(controller: _reasonController, decoration: InputDecoration(labelText: l10n.creditDebitReason), maxLines: 2),
          const SizedBox(height: 16),
          Text(l10n.quoteItems, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ..._items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  Expanded(flex: 3, child: TextField(controller: item.$1, decoration: InputDecoration(labelText: l10n.quoteItemDescription))),
                  const SizedBox(width: 8),
                  Expanded(child: TextField(controller: item.$2, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.quoteItemQty))),
                  const SizedBox(width: 8),
                  Expanded(child: TextField(controller: item.$3, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.quoteItemPrice), onChanged: (_) => setState(() {}))),
                ]),
              )),
          TextButton.icon(onPressed: _addItem, icon: const Icon(Icons.add), label: Text(l10n.quoteAddItem)),
          const SizedBox(height: 12),
          Text('${l10n.quoteTotal}: ₪${_total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 20),
          FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? '…' : l10n.quoteSave)),
        ],
      ),
    );
  }
}
