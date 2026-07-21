import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:printing/printing.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/invoices_service.dart';
import '../services/validators.dart';
import '../invalid_email_dialog.dart';
import '../widgets/document_preview_card.dart';

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({super.key});
  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  late final InvoicesService _svc;
  List<Invoice> _invoices = [];
  bool _loading = true;
  int? _pdfLoadingId;

  @override
  void initState() {
    super.initState();
    _svc = InvoicesService(context.read<ApiService>());
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final invoices = await _svc.list();
      if (mounted) setState(() { _invoices = invoices; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _viewPdf(Invoice inv) async {
    setState(() => _pdfLoadingId = inv.id);
    try {
      final bytes = await _svc.getPdf(inv.id);
      if (!mounted) return;
      await Printing.layoutPdf(onLayout: (_) => bytes, name: inv.invoiceNumber ?? 'invoice-${inv.id}');
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.invoicePdfUnavailable)));
      }
    } finally {
      if (mounted) setState(() => _pdfLoadingId = null);
    }
  }

  Color _statusColor(InvoiceStatus s) => switch (s) {
        InvoiceStatus.paid => Colors.green,
        InvoiceStatus.cancelled => Colors.red,
        InvoiceStatus.sent => AppColors.primary,
        InvoiceStatus.draft => AppColors.inkSoft,
      };

  String _statusLabel(InvoiceStatus s, AppLocalizations l10n) => switch (s) {
        InvoiceStatus.paid => l10n.invoiceStatusPaid,
        InvoiceStatus.cancelled => l10n.invoiceStatusCancelled,
        InvoiceStatus.sent => l10n.invoiceStatusSent,
        InvoiceStatus.draft => l10n.invoiceStatusDraft,
      };

  Future<void> _markPaid(Invoice inv) async {
    await _svc.markPaid(inv.id);
    _load();
  }

  Future<void> _openCreate() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const _InvoiceFormScreen()),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.invoicesTitle), backgroundColor: Colors.transparent),
      floatingActionButton: FloatingActionButton(onPressed: _openCreate, child: const Icon(Icons.add)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _invoices.isEmpty
              ? Center(child: Text(l10n.invoicesEmpty, style: const TextStyle(color: AppColors.inkSoft)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: _invoices.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final inv = _invoices[i];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              DocumentPreviewCard(
                                docNumber: inv.invoiceNumber ?? '#${inv.id}',
                                clientName: inv.clientName,
                                total: inv.total,
                                items: inv.items.map((it) => PreviewLineItem(it.description, it.quantity)).toList(),
                                loading: _pdfLoadingId == inv.id,
                                onTap: () => _viewPdf(inv),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(inv.clientName, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    Text('₪${inv.total.toStringAsFixed(2)} · ${inv.invoiceNumber ?? '#${inv.id}'}'),
                                    const SizedBox(height: 4),
                                    Wrap(
                                      spacing: 6,
                                      crossAxisAlignment: WrapCrossAlignment.center,
                                      children: [
                                        if (inv.status != InvoiceStatus.paid && inv.status != InvoiceStatus.cancelled)
                                          TextButton(onPressed: () => _markPaid(inv), child: Text(l10n.invoiceMarkPaid)),
                                        Chip(
                                          label: Text(_statusLabel(inv.status, l10n), style: const TextStyle(color: Colors.white, fontSize: 11)),
                                          backgroundColor: _statusColor(inv.status),
                                          padding: EdgeInsets.zero,
                                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}

class _InvoiceFormScreen extends StatefulWidget {
  const _InvoiceFormScreen();
  @override
  State<_InvoiceFormScreen> createState() => _InvoiceFormScreenState();
}

class _InvoiceFormScreenState extends State<_InvoiceFormScreen> {
  final _clientController = TextEditingController();
  final _emailController = TextEditingController();
  final List<(TextEditingController, TextEditingController, TextEditingController)> _items = [];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _addItem();
  }

  void _addItem() {
    setState(() => _items.add((TextEditingController(), TextEditingController(text: '1'), TextEditingController(text: '0'))));
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
    if (_clientController.text.trim().isEmpty) return;

    final email = _emailController.text.trim();
    if (email.isNotEmpty && !isValidEmail(email)) {
      final skip = await confirmInvalidEmail(context);
      if (!mounted) return;
      if (!skip) return; // user chose "Fix" — let them edit the field
      _emailController.clear();
    }

    setState(() => _saving = true);
    try {
      final svc = InvoicesService(context.read<ApiService>());
      await svc.create(
        clientName: _clientController.text.trim(),
        clientEmail: _emailController.text.trim(),
        items: _items
            .where((i) => i.$1.text.trim().isNotEmpty)
            .map((i) => InvoiceItem(
                  description: i.$1.text.trim(),
                  quantity: double.tryParse(i.$2.text) ?? 1,
                  unitPrice: double.tryParse(i.$3.text) ?? 0,
                ))
            .toList(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.invoiceSaveError)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.invoiceNew)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(controller: _clientController, decoration: InputDecoration(labelText: l10n.quoteClientName)),
          const SizedBox(height: 10),
          TextField(controller: _emailController, decoration: InputDecoration(labelText: l10n.quoteClientEmail)),
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
