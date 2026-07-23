import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:printing/printing.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/quotes_service.dart';
import '../services/invoices_service.dart';

/// Opened from any quote/invoice/delivery-note row — shows the whole
/// order-processing chain that document belongs to (quote -> order ->
/// delivery note -> signature -> invoice), whichever of those exist,
/// since the chain can start at any step.
class ChainViewScreen extends StatefulWidget {
  const ChainViewScreen({super.key, required this.docType, required this.docId});
  final String docType; // 'quote' | 'order' | 'delivery-note' | 'invoice'
  final int docId;

  @override
  State<ChainViewScreen> createState() => _ChainViewScreenState();
}

class _ChainViewScreenState extends State<ChainViewScreen> {
  Map<String, dynamic>? _chain;
  bool _loading = true;
  String? _error;
  int? _pdfLoadingKey;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final result = await context.read<ApiService>().get('/order-chain/for/${widget.docType}/${widget.docId}');
      if (mounted) setState(() { _chain = result as Map<String, dynamic>; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _viewQuotePdf(int id) async {
    setState(() => _pdfLoadingKey = id);
    try {
      final bytes = await QuotesService(context.read<ApiService>()).getPdf(id);
      if (mounted) await Printing.layoutPdf(onLayout: (_) => bytes);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.quotePdfUnavailable)));
    } finally {
      if (mounted) setState(() => _pdfLoadingKey = null);
    }
  }

  Future<void> _viewInvoicePdf(int id) async {
    setState(() => _pdfLoadingKey = -id); // negative to not collide with quote ids in the loading indicator
    try {
      final bytes = await InvoicesService(context.read<ApiService>()).getPdf(id);
      if (mounted) await Printing.layoutPdf(onLayout: (_) => bytes);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.invoicePdfUnavailable)));
    } finally {
      if (mounted) setState(() => _pdfLoadingKey = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.chainViewTitle)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
              : _buildChain(l10n),
    );
  }

  Widget _buildChain(AppLocalizations l10n) {
    final chain = _chain!;
    final quotes = (chain['quotes'] as List).cast<Map<String, dynamic>>();
    final orders = (chain['orders'] as List).cast<Map<String, dynamic>>();
    final notes = (chain['deliveryNotes'] as List).cast<Map<String, dynamic>>();
    final invoices = (chain['invoices'] as List).cast<Map<String, dynamic>>();
    final status = chain['status'] as Map<String, dynamic>;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _StatusBar(status: status, l10n: l10n),
        const SizedBox(height: 20),
        _Section(title: l10n.chainStepQuote, icon: Icons.request_quote_outlined, empty: quotes.isEmpty, children: quotes.map((q) => _DocCard(
          title: q['quoteNumber'] as String? ?? '#${q['id']}',
          subtitle: q['clientName'] as String? ?? '',
          trailing: '₪${(q['total'] is num ? q['total'] : num.tryParse('${q['total']}') ?? 0).toStringAsFixed(2)}',
          loading: _pdfLoadingKey == q['id'],
          onTap: () => _viewQuotePdf(q['id'] as int),
        )).toList()),
        _Section(title: l10n.chainStepOrder, icon: Icons.inventory_2_outlined, empty: orders.isEmpty, children: orders.map((o) => _DocCard(
          title: o['poNumberLast4'] != null ? '···${o['poNumberLast4']}' : '#${o['id']}',
          subtitle: o['organization'] as String? ?? '',
        )).toList()),
        _Section(title: l10n.chainStepDeliveryNote, icon: Icons.local_shipping_outlined, empty: notes.isEmpty, children: notes.map((n) => _DocCard(
          title: n['noteNumber'] as String? ?? '#${n['id']}',
          subtitle: n['clientName'] as String? ?? '',
          trailing: (n['lesseeSignedAt'] != null || n['status'] == 'signed') ? l10n.chainSigned : l10n.chainNotSigned,
          trailingColor: (n['lesseeSignedAt'] != null || n['status'] == 'signed') ? AppColors.success : AppColors.stamp,
        )).toList()),
        _Section(title: l10n.chainStepInvoice, icon: Icons.receipt_long_outlined, empty: invoices.isEmpty, children: invoices.map((i) => _DocCard(
          title: i['invoiceNumber'] as String? ?? '#${i['id']}',
          subtitle: i['clientName'] as String? ?? '',
          trailing: '₪${(i['total'] is num ? i['total'] : num.tryParse('${i['total']}') ?? 0).toStringAsFixed(2)}',
          loading: _pdfLoadingKey == -(i['id'] as int),
          onTap: () => _viewInvoicePdf(i['id'] as int),
        )).toList()),
      ],
    );
  }
}

class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.status, required this.l10n});
  final Map<String, dynamic> status;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final complete = status['complete'] == true;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: complete ? AppColors.success.withOpacity(0.1) : AppColors.stampWash,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(children: [
        Icon(complete ? Icons.check_circle : Icons.hourglass_top, color: complete ? AppColors.success : AppColors.stamp),
        const SizedBox(width: 10),
        Expanded(child: Text(complete ? l10n.chainComplete : l10n.chainInProgress, style: const TextStyle(fontWeight: FontWeight.w700))),
      ]),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.icon, required this.empty, required this.children});
  final String title;
  final IconData icon;
  final bool empty;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 17, color: AppColors.inkSoft),
            const SizedBox(width: 8),
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
          ]),
          const SizedBox(height: 8),
          if (empty)
            Padding(padding: const EdgeInsets.only(left: 25), child: Text('—', style: const TextStyle(color: AppColors.inkSoft)))
          else
            ...children,
        ],
      ),
    );
  }
}

class _DocCard extends StatelessWidget {
  const _DocCard({required this.title, required this.subtitle, this.trailing, this.trailingColor, this.onTap, this.loading = false});
  final String title;
  final String subtitle;
  final String? trailing;
  final Color? trailingColor;
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        onTap: onTap,
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle),
        trailing: loading
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : trailing != null ? Text(trailing!, style: TextStyle(fontWeight: FontWeight.w700, color: trailingColor)) : null,
      ),
    );
  }
}
