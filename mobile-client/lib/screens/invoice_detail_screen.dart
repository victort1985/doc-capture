import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:printing/printing.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/invoices_service.dart';
import '../services/delivery_notes_service.dart';
import '../widgets/search_picker_field.dart';
import 'payments_screen.dart';

/// Opened by tapping an invoice row — shows a quick summary, lets you
/// view the PDF, and (once the chain doesn't already have a payment
/// recorded) offers a "Pay" button that opens the payment form
/// pre-filled with this invoice's client and total.
class InvoiceDetailScreen extends StatefulWidget {
  const InvoiceDetailScreen({super.key, required this.invoice});
  final Invoice invoice;

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  bool _loadingChain = true;
  bool _hasPayment = false;
  String? _chainId;

  @override
  void initState() {
    super.initState();
    _loadChain();
  }

  Future<void> _loadChain() async {
    try {
      final chain = await context.read<ApiService>().get('/order-chain/for/invoice/${widget.invoice.id}');
      if (!mounted) return;
      setState(() {
        _chainId = chain['chainId'] as String?;
        _hasPayment = (chain['status']?['hasPayment'] as bool?) ?? false;
        _loadingChain = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingChain = false);
    }
  }

  Future<void> _viewPdf() async {
    try {
      final bytes = await InvoicesService(context.read<ApiService>()).getPdf(widget.invoice.id);
      if (mounted) await Printing.layoutPdf(onLayout: (_) => bytes, name: widget.invoice.invoiceNumber ?? 'invoice-${widget.invoice.id}');
    } catch (_) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.invoicePdfUnavailable)));
      }
    }
  }

  List<DeliveryNote>? _notesCache;

  Future<List<DeliveryNote>> _searchNotes(String query) async {
    _notesCache ??= await DeliveryNotesService(context.read<ApiService>()).list();
    final q = query.toLowerCase();
    return _notesCache!
        .where((n) => (n.noteNumber ?? '').toLowerCase().contains(q) || (n.clientName ?? '').toLowerCase().contains(q))
        .toList();
  }

  /// Manually links this invoice into an existing delivery note's chain.
  Future<void> _linkToDeliveryNote() async {
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
            Text(l10n.linkToNoteTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 4),
            Text(l10n.invoiceFromQuotePickHint, style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft)),
            const SizedBox(height: 12),
            SearchPickerField<DeliveryNote>(
              search: _searchNotes,
              displayString: (n) => n.noteNumber ?? '#${n.id}',
              listLabel: (n) => '${n.noteNumber ?? '#${n.id}'} · ${n.clientName ?? ''}',
              hintText: l10n.invoiceFromQuoteSearchHint,
              onSelected: (n) => Navigator.of(ctx).pop(n),
            ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    try {
      await context.read<ApiService>().post('/order-chain/link', {
        'sourceType': 'invoice', 'sourceId': widget.invoice.id,
        'targetType': 'delivery-note', 'targetId': picked.id,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.linkedSuccessfully)));
      _loadChain();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _pay() async {
    final paid = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => PaymentFormScreen(
        prefillClientName: widget.invoice.clientName,
        prefillAmount: widget.invoice.total,
        prefillInvoiceId: widget.invoice.id,
        prefillChainId: _chainId,
      ),
    ));
    if (paid == true) _loadChain();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final inv = widget.invoice;
    return Scaffold(
      appBar: AppBar(title: Text(inv.invoiceNumber ?? '#${inv.id}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(inv.clientName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                if (inv.clientEmail != null) Text(inv.clientEmail!, style: const TextStyle(color: AppColors.inkSoft)),
                const SizedBox(height: 12),
                for (final item in inv.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Expanded(child: Text(item.description)),
                      Text('${item.quantity} × ₪${item.unitPrice.toStringAsFixed(2)}'),
                    ]),
                  ),
                const Divider(height: 24),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text(l10n.quoteTotal, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text('₪${inv.total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                ]),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: _viewPdf, icon: const Icon(Icons.picture_as_pdf_outlined, size: 18), label: Text(l10n.invoiceViewPdf)),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: _linkToDeliveryNote, icon: const Icon(Icons.link, size: 18), label: Text(l10n.linkToNoteButton)),
          if (_hasPayment) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.success.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
              child: Row(children: [
                const Icon(Icons.check_circle, color: AppColors.success, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text(l10n.paymentAlreadyRecorded, style: const TextStyle(fontWeight: FontWeight.w600))),
              ]),
            ),
          ],
        ],
      ),
      bottomNavigationBar: (!_loadingChain && !_hasPayment)
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton.icon(
                  onPressed: _pay,
                  icon: const Icon(Icons.payments_outlined, size: 18),
                  label: Text(l10n.paymentPayButton),
                ),
              ),
            )
          : null,
    );
  }
}
