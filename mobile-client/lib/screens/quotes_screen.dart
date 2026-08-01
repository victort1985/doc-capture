import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:printing/printing.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/quotes_service.dart';
import '../services/validators.dart';
import '../invalid_email_dialog.dart';
import '../widgets/document_preview_card.dart';
import 'chain_view_screen.dart';
import '../widgets/chain_status_badge.dart';
import '../widgets/price_list_picker.dart';

class QuotesScreen extends StatefulWidget {
  const QuotesScreen({super.key});
  @override
  State<QuotesScreen> createState() => QuotesScreenState();
}

class QuotesScreenState extends State<QuotesScreen> {
  late final QuotesService _svc;
  List<Quote> _quotes = [];
  bool _loading = true;
  int? _pdfLoadingId;
  Map<String, dynamic> _chainStatus = {};

  @override
  void initState() {
    super.initState();
    _svc = QuotesService(context.read<ApiService>());
    _load();
  }

  /// See DeliveryNotesScreenState.refresh() for why this exists.
  Future<void> refresh() => _load();

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final quotes = await _svc.list();
      if (mounted) setState(() { _quotes = quotes; _loading = false; });
      if (mounted) {
        final status = await fetchChainStatusBatch(context, quotes.map((q) => ChainStatusRequest('quote', q.id)).toList());
        if (mounted) setState(() => _chainStatus = status);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _viewPdf(Quote q) async {
    setState(() => _pdfLoadingId = q.id);
    try {
      final bytes = await _svc.getPdf(q.id);
      if (!mounted) return;
      await Printing.layoutPdf(onLayout: (_) => bytes, name: q.quoteNumber ?? 'quote-${q.id}');
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.quotePdfUnavailable)));
      }
    } finally {
      if (mounted) setState(() => _pdfLoadingId = null);
    }
  }

  Color _statusColor(QuoteStatus s) => switch (s) {
        QuoteStatus.approved => Colors.green,
        QuoteStatus.declined => Colors.red,
        QuoteStatus.sent => AppColors.primary,
        QuoteStatus.draft => AppColors.inkSoft,
      };

  String _statusLabel(QuoteStatus s, AppLocalizations l10n) => switch (s) {
        QuoteStatus.approved => l10n.quoteStatusApproved,
        QuoteStatus.declined => l10n.quoteStatusDeclined,
        QuoteStatus.sent => l10n.quoteStatusSent,
        QuoteStatus.draft => l10n.quoteStatusDraft,
      };

  Future<void> _saveAsTemplate(Quote q) async {
    final l10n = AppLocalizations.of(context)!;
    final controller = TextEditingController(text: q.templateName ?? '');
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.quoteSaveAsTemplate),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(labelText: l10n.quoteTemplateName),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: Text(l10n.quoteSaveAsTemplate),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty || !mounted) return;
    try {
      await QuotesService(context.read<ApiService>()).saveAsTemplate(q.id, name);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.quoteSavedAsTemplate)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.quoteSaveTemplateError)));
    }
  }

  Future<void> _openCreate() async {
    final l10n = AppLocalizations.of(context)!;
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.note_add_outlined),
              title: Text(l10n.quoteNewBlank),
              onTap: () => Navigator.of(ctx).pop('blank'),
            ),
            ListTile(
              leading: const Icon(Icons.bookmark_outline),
              title: Text(l10n.quoteFromTemplate),
              onTap: () => Navigator.of(ctx).pop('template'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;

    if (choice == 'blank') {
      final created = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => const _QuoteFormScreen()),
      );
      if (created == true) _load();
      return;
    }

    // choice == 'template'
    List<Quote> templates;
    try {
      templates = await QuotesService(context.read<ApiService>()).listTemplates();
    } catch (_) {
      templates = [];
    }
    if (!mounted) return;
    if (templates.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.quoteNoTemplatesYet)));
      return;
    }
    final picked = await showModalBottomSheet<Quote>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        maxChildSize: 0.85,
        expand: false,
        builder: (ctx, scrollController) => ListView.separated(
          controller: scrollController,
          padding: const EdgeInsets.all(16),
          itemCount: templates.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final t = templates[i];
            return Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.bookmark_outline, size: 18)),
                title: Text(t.templateName ?? '#${t.templateNumber}'),
                subtitle: Text('${t.clientName} · ₪${t.total.toStringAsFixed(2)}'),
                onTap: () => Navigator.of(ctx).pop(t),
              ),
            );
          },
        ),
      ),
    );
    if (picked == null || !mounted) return;
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => _QuoteFormScreen(template: picked)),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.quotesTitle), backgroundColor: Colors.transparent),
      floatingActionButton: FloatingActionButton(onPressed: _openCreate, child: const Icon(Icons.add)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _quotes.isEmpty
              ? Center(child: Text(l10n.quotesEmpty, style: const TextStyle(color: AppColors.inkSoft)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: _quotes.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final q = _quotes[i];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              DocumentPreviewCard(
                                docNumber: q.quoteNumber ?? '#${q.id}',
                                clientName: q.clientName,
                                total: q.total,
                                items: q.items.map((it) => PreviewLineItem(it.description, it.quantity)).toList(),
                                loading: _pdfLoadingId == q.id,
                                onTap: () => _viewPdf(q),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(q.clientName, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    Text('₪${q.total.toStringAsFixed(2)} · ${q.quoteNumber ?? '#${q.id}'}'),
                                    const SizedBox(height: 4),
                                    Chip(
                                      label: Text(_statusLabel(q.status, l10n), style: const TextStyle(color: Colors.white, fontSize: 11)),
                                      backgroundColor: _statusColor(q.status),
                                      padding: EdgeInsets.zero,
                                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                    ),
                                  ],
                                ),
                              ),
                              ChainStatusBadge(status: _chainStatus['quote:${q.id}']),
                              IconButton(
                                icon: const Icon(Icons.bookmark_outline, size: 20),
                                tooltip: l10n.quoteSaveAsTemplate,
                                onPressed: () => _saveAsTemplate(q),
                              ),
                              IconButton(
                                icon: const Icon(Icons.timeline_outlined, size: 20),
                                tooltip: l10n.chainViewTitle,
                                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                                  builder: (_) => ChainViewScreen(docType: 'quote', docId: q.id),
                                )),
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

class _QuoteFormScreen extends StatefulWidget {
  const _QuoteFormScreen({this.template});
  final Quote? template;
  @override
  State<_QuoteFormScreen> createState() => _QuoteFormScreenState();
}

class _QuoteFormScreenState extends State<_QuoteFormScreen> {
  final _clientController = TextEditingController();
  final _emailController = TextEditingController();
  final List<(TextEditingController, TextEditingController, TextEditingController)> _items = [];
  String _currency = 'ILS';
  VatCategory _vatCategory = VatCategory.standard;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final template = widget.template;
    if (template != null) {
      // Pre-fills from the template — every field here stays a plain
      // editable text field, same as a blank form, so "replace or add
      // only part of the information" is just typing over whatever
      // isn't right for this particular client.
      _clientController.text = template.clientName;
      _emailController.text = template.clientEmail ?? '';
      _currency = template.currency;
      _vatCategory = template.vatCategory;
      if (template.items.isEmpty) {
        _addItem();
      } else {
        for (final it in template.items) {
          _items.add((
            TextEditingController(text: it.description),
            TextEditingController(text: it.quantity.toString()),
            TextEditingController(text: it.unitPrice.toString()),
          ));
        }
      }
    } else {
      _addItem();
    }
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
      final svc = QuotesService(context.read<ApiService>());
      final items = _items
          .where((i) => i.$1.text.trim().isNotEmpty)
          .map((i) => QuoteItem(
                description: i.$1.text.trim(),
                quantity: double.tryParse(i.$2.text) ?? 1,
                unitPrice: double.tryParse(i.$3.text) ?? 0,
              ))
          .toList();
      if (widget.template != null) {
        await svc.createFromTemplate(
          widget.template!.id,
          clientName: _clientController.text.trim(),
          clientEmail: _emailController.text.trim(),
          items: items,
          currency: _currency,
          vatCategory: _vatCategory,
        );
      } else {
        await svc.create(
          clientName: _clientController.text.trim(),
          clientEmail: _emailController.text.trim(),
          items: items,
          currency: _currency,
          vatCategory: _vatCategory,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.quoteSaveError)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.quoteNew)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(controller: _clientController, decoration: InputDecoration(labelText: l10n.quoteClientName)),
          const SizedBox(height: 10),
          TextField(controller: _emailController, decoration: InputDecoration(labelText: l10n.quoteClientEmail)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _currency,
                decoration: InputDecoration(labelText: l10n.quoteCurrency),
                items: kSupportedCurrencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setState(() => _currency = v ?? 'ILS'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButtonFormField<VatCategory>(
                value: _vatCategory,
                decoration: InputDecoration(labelText: l10n.quoteVatCategory),
                items: [
                  DropdownMenuItem(value: VatCategory.standard, child: Text(l10n.vatCategoryStandard)),
                  DropdownMenuItem(value: VatCategory.zero, child: Text(l10n.vatCategoryZero)),
                  DropdownMenuItem(value: VatCategory.exempt, child: Text(l10n.vatCategoryExempt)),
                ],
                onChanged: (v) => setState(() => _vatCategory = v ?? VatCategory.standard),
              ),
            ),
          ]),
          const SizedBox(height: 16),
          Text(l10n.quoteItems, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ..._items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  Expanded(flex: 3, child: TextField(controller: item.$1, decoration: InputDecoration(labelText: l10n.quoteItemDescription))),
                  IconButton(
                    icon: const Icon(Icons.list_alt_outlined, size: 20),
                    tooltip: l10n.priceListPickTitle,
                    onPressed: () async {
                      final picked = await showPriceListPicker(context);
                      if (picked != null) {
                        setState(() {
                          item.$1.text = picked.name;
                          item.$3.text = picked.price.toStringAsFixed(2);
                        });
                      }
                    },
                  ),
                  const SizedBox(width: 4),
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
