import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:printing/printing.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/payments_service.dart';
import '../services/invoices_service.dart';
import '../widgets/search_picker_field.dart';
import 'chain_view_screen.dart';
import '../widgets/chain_status_badge.dart';

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
  Map<String, dynamic> _chainStatus = {};

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
      if (mounted) {
        final status = await fetchChainStatusBatch(context, payments.map((p) => ChainStatusRequest('payment', p.id)).toList());
        if (mounted) setState(() => _chainStatus = status);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _viewPdf(Payment p, {bool asCopy = false}) async {
    setState(() => _pdfLoadingId = p.id);
    try {
      final bytes = await _svc.getPdf(p.id, asCopy: asCopy);
      if (!mounted) return;
      await Printing.layoutPdf(onLayout: (_) => bytes, name: asCopy ? '${p.paymentNumber ?? p.id}-copy' : (p.paymentNumber ?? 'payment-${p.id}'));
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.paymentPdfUnavailable)));
      }
    } finally {
      if (mounted) setState(() => _pdfLoadingId = null);
    }
  }

  Future<void> _viewChainSummary(Payment p) async {
    setState(() => _pdfLoadingId = p.id);
    try {
      final bytes = await _svc.getChainSummaryPdf(p.id);
      if (!mounted) return;
      await Printing.layoutPdf(onLayout: (_) => bytes, name: 'order-summary-${p.id}');
    } catch (e) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.paymentSummaryUnavailable)));
      }
    } finally {
      if (mounted) setState(() => _pdfLoadingId = null);
    }
  }

  IconData _methodIcon(PaymentMethod m) => switch (m) {
        PaymentMethod.cash => Icons.payments_outlined,
        PaymentMethod.bankTransfer => Icons.account_balance_outlined,
        PaymentMethod.creditCard => Icons.credit_card_outlined,
        PaymentMethod.check => Icons.receipt_outlined,
        PaymentMethod.bit => Icons.smartphone_outlined,
        PaymentMethod.standingOrder => Icons.repeat_outlined,
      };

  String _methodLabel(PaymentMethod m, AppLocalizations l10n) => switch (m) {
        PaymentMethod.cash => l10n.paymentMethodCash,
        PaymentMethod.bankTransfer => l10n.paymentMethodBankTransfer,
        PaymentMethod.creditCard => l10n.paymentMethodCreditCard,
        PaymentMethod.check => l10n.paymentMethodCheck,
        PaymentMethod.bit => l10n.paymentMethodBit,
        PaymentMethod.standingOrder => l10n.paymentMethodStandingOrder,
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
      appBar: AppBar(title: Text(l10n.paymentsTitle), backgroundColor: Colors.transparent),
      backgroundColor: Colors.transparent,
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
                          onTap: () => showModalBottomSheet(
                            context: context,
                            builder: (ctx) => SafeArea(
                              child: Column(mainAxisSize: MainAxisSize.min, children: [
                                ListTile(
                                  leading: const Icon(Icons.description_outlined),
                                  title: Text(l10n.paymentViewOriginal),
                                  onTap: () { Navigator.of(ctx).pop(); _viewPdf(p); },
                                ),
                                ListTile(
                                  leading: const Icon(Icons.verified_outlined),
                                  title: Text(l10n.paymentPrintCopy),
                                  subtitle: Text(l10n.paymentPrintCopyHint),
                                  onTap: () { Navigator.of(ctx).pop(); _viewPdf(p, asCopy: true); },
                                ),
                                if (p.hasChainSummary)
                                  ListTile(
                                    leading: const Icon(Icons.folder_zip_outlined),
                                    title: Text(l10n.paymentViewSummary),
                                    onTap: () { Navigator.of(ctx).pop(); _viewChainSummary(p); },
                                  ),
                              ]),
                            ),
                          ),
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
                              const SizedBox(width: 6),
                              ChainStatusBadge(status: _chainStatus['payment:${p.id}']),
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
  final _notesController = TextEditingController();

  // Method-specific field controllers — only the ones relevant to the
  // selected method actually get shown/sent.
  final _cardLast4Controller = TextEditingController();
  final _approvalNumberController = TextEditingController();
  final _installmentsController = TextEditingController(text: '1');
  String _cardType = 'visa';
  final _checkNumberController = TextEditingController();
  final _bankNameController = TextEditingController();
  final _branchNumberController = TextEditingController();
  final _accountNumberController = TextEditingController();
  DateTime? _checkDate;
  final _referenceNumberController = TextEditingController();

  PaymentMethod _method = PaymentMethod.cash;
  bool _saving = false;
  int? _linkedInvoiceId;
  List<Invoice>? _invoicesCache;

  @override
  void initState() {
    super.initState();
    if (widget.prefillClientName != null) _clientController.text = widget.prefillClientName!;
    if (widget.prefillAmount != null) _amountController.text = widget.prefillAmount!.toStringAsFixed(2);
    _linkedInvoiceId = widget.prefillInvoiceId;
  }

  Future<List<Invoice>> _searchInvoices(String query) async {
    _invoicesCache ??= await InvoicesService(context.read<ApiService>()).list();
    final q = query.toLowerCase();
    return _invoicesCache!
        .where((inv) => (inv.invoiceNumber ?? '').toLowerCase().contains(q) || inv.clientName.toLowerCase().contains(q))
        .toList();
  }

  /// Lets the person creating a receipt pick which invoice it settles
  /// — the same picker pattern used elsewhere (quote/order/delivery-
  /// note pickers), rather than only being reachable via the invoice
  /// screen's own "Pay" button. Prefills client name and amount from
  /// the chosen invoice if those fields are still empty.
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
            Text(l10n.paymentPickInvoiceTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 12),
            SearchPickerField<Invoice>(
              search: _searchInvoices,
              displayString: (inv) => inv.invoiceNumber ?? '#${inv.id}',
              listLabel: (inv) => '${inv.invoiceNumber ?? '#${inv.id}'} · ${inv.clientName} · ₪${inv.total.toStringAsFixed(2)}',
              hintText: l10n.invoiceFromQuoteSearchHint,
              onSelected: (inv) => Navigator.of(ctx).pop(inv),
            ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    setState(() {
      _linkedInvoiceId = picked.id;
      if (_clientController.text.trim().isEmpty) _clientController.text = picked.clientName;
      if (_amountController.text.trim().isEmpty || _amountController.text.trim() == '0.00') {
        _amountController.text = picked.total.toStringAsFixed(2);
      }
    });
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
        notes: _notesController.text.trim(),
        invoiceId: _linkedInvoiceId,
        chainId: widget.prefillChainId,
        cardLast4: _method == PaymentMethod.creditCard ? _cardLast4Controller.text.trim() : null,
        cardType: _method == PaymentMethod.creditCard ? _cardType : null,
        approvalNumber: _method == PaymentMethod.creditCard ? _approvalNumberController.text.trim() : null,
        installments: _method == PaymentMethod.creditCard ? int.tryParse(_installmentsController.text.trim()) : null,
        checkNumber: _method == PaymentMethod.check ? _checkNumberController.text.trim() : null,
        bankName: (_method == PaymentMethod.check || _method == PaymentMethod.bankTransfer) ? _bankNameController.text.trim() : null,
        branchNumber: _method == PaymentMethod.check ? _branchNumberController.text.trim() : null,
        accountNumber: _method == PaymentMethod.check ? _accountNumberController.text.trim() : null,
        checkDate: _method == PaymentMethod.check ? _checkDate?.toIso8601String().split('T').first : null,
        referenceNumber: [PaymentMethod.bankTransfer, PaymentMethod.bit, PaymentMethod.standingOrder].contains(_method)
            ? _referenceNumberController.text.trim() : null,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _methodLabel(PaymentMethod m, AppLocalizations l10n) => switch (m) {
        PaymentMethod.cash => l10n.paymentMethodCash,
        PaymentMethod.creditCard => l10n.paymentMethodCreditCard,
        PaymentMethod.bankTransfer => l10n.paymentMethodBankTransfer,
        PaymentMethod.check => l10n.paymentMethodCheck,
        PaymentMethod.bit => l10n.paymentMethodBit,
        PaymentMethod.standingOrder => l10n.paymentMethodStandingOrder,
      };

  /// The fields relevant to whichever method is currently selected —
  /// built as its own widget list so the form only ever shows what
  /// actually applies (a cash payment has no card/check fields, etc.)
  List<Widget> _methodSpecificFields(AppLocalizations l10n) {
    switch (_method) {
      case PaymentMethod.creditCard:
        return [
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _cardLast4Controller,
                keyboardType: TextInputType.number,
                maxLength: 4,
                decoration: InputDecoration(labelText: l10n.paymentCardLast4, counterText: ''),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _cardType,
                decoration: InputDecoration(labelText: l10n.paymentCardType),
                items: const [
                  DropdownMenuItem(value: 'visa', child: Text('Visa')),
                  DropdownMenuItem(value: 'mastercard', child: Text('Mastercard')),
                  DropdownMenuItem(value: 'isracard', child: Text('Isracard')),
                  DropdownMenuItem(value: 'amex', child: Text('Amex')),
                  DropdownMenuItem(value: 'diners', child: Text('Diners')),
                ],
                onChanged: (v) => setState(() => _cardType = v ?? 'visa'),
              ),
            ),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextField(controller: _approvalNumberController, decoration: InputDecoration(labelText: l10n.paymentApprovalNumber))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _installmentsController, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.paymentInstallments))),
          ]),
        ];
      case PaymentMethod.check:
        return [
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextField(controller: _checkNumberController, decoration: InputDecoration(labelText: l10n.paymentCheckNumber))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _bankNameController, decoration: InputDecoration(labelText: l10n.paymentBankName))),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextField(controller: _branchNumberController, decoration: InputDecoration(labelText: l10n.paymentBranchNumber))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _accountNumberController, decoration: InputDecoration(labelText: l10n.paymentAccountNumber))),
          ]),
          const SizedBox(height: 12),
          InkWell(
            onTap: () async {
              final picked = await showDatePicker(
                context: context, initialDate: _checkDate ?? DateTime.now(),
                firstDate: DateTime.now().subtract(const Duration(days: 30)),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (picked != null) setState(() => _checkDate = picked);
            },
            child: InputDecorator(
              decoration: InputDecoration(labelText: l10n.paymentCheckDate),
              child: Text(_checkDate == null ? l10n.paymentCheckDateHint : '${_checkDate!.day}/${_checkDate!.month}/${_checkDate!.year}'),
            ),
          ),
        ];
      case PaymentMethod.bankTransfer:
        return [
          const SizedBox(height: 12),
          TextField(controller: _bankNameController, decoration: InputDecoration(labelText: l10n.paymentBankName)),
          const SizedBox(height: 12),
          TextField(controller: _referenceNumberController, decoration: InputDecoration(labelText: l10n.paymentReferenceNumber)),
        ];
      case PaymentMethod.bit:
      case PaymentMethod.standingOrder:
        return [
          const SizedBox(height: 12),
          TextField(controller: _referenceNumberController, decoration: InputDecoration(labelText: l10n.paymentReferenceNumber)),
        ];
      case PaymentMethod.cash:
        return [];
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
          OutlinedButton.icon(
            onPressed: _pickInvoice,
            icon: const Icon(Icons.receipt_long_outlined, size: 18),
            label: Text(_linkedInvoiceId != null ? l10n.paymentInvoiceLinked : l10n.paymentPickInvoiceButton),
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
            items: PaymentMethod.values.map((m) => DropdownMenuItem(value: m, child: Text(_methodLabel(m, l10n)))).toList(),
            onChanged: (v) => setState(() => _method = v ?? PaymentMethod.cash),
          ),
          ..._methodSpecificFields(l10n),
          const SizedBox(height: 12),
          TextField(controller: _notesController, maxLines: 2, decoration: InputDecoration(labelText: l10n.paymentNotes)),
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
