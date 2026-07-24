import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:printing/printing.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/payments_service.dart';
import 'chain_view_screen.dart';

class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});
  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  late final PaymentsService _svc;
  List<Payment> _payments = [];
  bool _loading = true;
  int? _pdfLoadingId;

  @override
  void initState() {
    super.initState();
    _svc = PaymentsService(context.read<ApiService>());
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final payments = await _svc.list();
      if (mounted) setState(() { _payments = payments; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _viewPdf(Payment p) async {
    setState(() => _pdfLoadingId = p.id);
    try {
      final bytes = await _svc.getPdf(p.id);
      if (!mounted) return;
      await Printing.layoutPdf(onLayout: (_) => bytes, name: p.paymentNumber ?? 'payment-${p.id}');
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.paymentPdfUnavailable)));
      }
    } finally {
      if (mounted) setState(() => _pdfLoadingId = null);
    }
  }

  IconData _methodIcon(PaymentMethod m) => switch (m) {
        PaymentMethod.cash => Icons.payments_outlined,
        PaymentMethod.transfer => Icons.account_balance_outlined,
        PaymentMethod.card => Icons.credit_card_outlined,
      };

  String _methodLabel(PaymentMethod m, AppLocalizations l10n) => switch (m) {
        PaymentMethod.cash => l10n.paymentMethodCash,
        PaymentMethod.transfer => l10n.paymentMethodTransfer,
        PaymentMethod.card => l10n.paymentMethodCard,
      };

  Future<void> _openCreate() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const PaymentFormScreen()),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.paymentsTitle)),
      floatingActionButton: FloatingActionButton(onPressed: _openCreate, child: const Icon(Icons.add)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _payments.isEmpty
                ? ListView(children: [
                    const SizedBox(height: 80),
                    Center(child: Text(l10n.paymentsEmpty, style: const TextStyle(color: AppColors.inkSoft))),
                  ])
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _payments.length,
                    itemBuilder: (context, i) {
                      final p = _payments[i];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          onTap: () => _viewPdf(p),
                          leading: CircleAvatar(
                            backgroundColor: AppColors.primary.withOpacity(0.1),
                            child: Icon(_methodIcon(p.method), color: AppColors.primary, size: 20),
                          ),
                          title: Text(p.clientName, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text('${p.paymentNumber ?? '#${p.id}'} · ${_methodLabel(p.method, l10n)}'),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('₪${p.amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                              const SizedBox(width: 4),
                              if (_pdfLoadingId == p.id)
                                const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                              else
                                IconButton(
                                  icon: const Icon(Icons.timeline_outlined, size: 20),
                                  tooltip: l10n.chainViewTitle,
                                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                                    builder: (_) => ChainViewScreen(docType: 'payment', docId: p.id),
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

/// Standalone payment recording — used both for the "+" FAB here and
/// (with prefill) from the invoice screen's "Pay" button.
class PaymentFormScreen extends StatefulWidget {
  const PaymentFormScreen({super.key, this.prefillClientName, this.prefillAmount, this.prefillInvoiceId, this.prefillChainId});
  final String? prefillClientName;
  final double? prefillAmount;
  final int? prefillInvoiceId;
  final String? prefillChainId;

  @override
  State<PaymentFormScreen> createState() => _PaymentFormScreenState();
}

class _PaymentFormScreenState extends State<PaymentFormScreen> {
  final _clientController = TextEditingController();
  final _emailController = TextEditingController();
  final _amountController = TextEditingController();
  PaymentMethod _method = PaymentMethod.card;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.prefillClientName != null) _clientController.text = widget.prefillClientName!;
    if (widget.prefillAmount != null) _amountController.text = widget.prefillAmount!.toStringAsFixed(2);
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;
    final amount = double.tryParse(_amountController.text.replaceAll(',', '.'));
    if (_clientController.text.trim().isEmpty || amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.paymentFormInvalid)));
      return;
    }
    setState(() => _saving = true);
    try {
      final svc = PaymentsService(context.read<ApiService>());
      await svc.create(
        clientName: _clientController.text.trim(),
        clientEmail: _emailController.text.trim(),
        amount: amount,
        method: _method,
        invoiceId: widget.prefillInvoiceId,
        chainId: widget.prefillChainId,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.paymentRecordTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.stampWash, borderRadius: BorderRadius.circular(10)),
            child: Text(l10n.paymentSimulatorNote, style: const TextStyle(fontSize: 12.5)),
          ),
          const SizedBox(height: 16),
          TextField(controller: _clientController, decoration: InputDecoration(labelText: l10n.quoteClientName)),
          const SizedBox(height: 12),
          TextField(controller: _emailController, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: l10n.quoteClientEmail)),
          const SizedBox(height: 12),
          TextField(controller: _amountController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: l10n.paymentAmount, prefixText: '₪ ')),
          const SizedBox(height: 12),
          DropdownButtonFormField<PaymentMethod>(
            value: _method,
            decoration: InputDecoration(labelText: l10n.paymentMethod),
            items: [
              DropdownMenuItem(value: PaymentMethod.card, child: Text(l10n.paymentMethodCard)),
              DropdownMenuItem(value: PaymentMethod.cash, child: Text(l10n.paymentMethodCash)),
              DropdownMenuItem(value: PaymentMethod.transfer, child: Text(l10n.paymentMethodTransfer)),
            ],
            onChanged: (v) => setState(() => _method = v ?? PaymentMethod.card),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l10n.paymentRecord),
          ),
        ],
      ),
    );
  }
}
