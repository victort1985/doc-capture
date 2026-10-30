import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/expenses_service.dart';
import '../services/payments_service.dart' show PaymentMethod;
import 'expense_form_screen.dart';

/// Read-only view of one expense: the stored receipt image plus every
/// field that was entered/scanned, with an "Edit" button.
class ExpenseDetailScreen extends StatefulWidget {
  const ExpenseDetailScreen({super.key, required this.expense});
  final Expense expense;
  @override
  State<ExpenseDetailScreen> createState() => _ExpenseDetailScreenState();
}

class _ExpenseDetailScreenState extends State<ExpenseDetailScreen> {
  late Expense _expense;
  Uint8List? _receipt;
  bool _receiptLoading = false;
  bool _receiptFailed = false;
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    _expense = widget.expense;
    _loadReceipt();
  }

  Future<void> _loadReceipt() async {
    if (!_expense.hasReceipt) {
      setState(() { _receipt = null; _receiptFailed = false; });
      return;
    }
    setState(() { _receiptLoading = true; _receiptFailed = false; });
    try {
      final bytes = await ExpensesService(context.read<ApiService>()).fetchReceipt(_expense.id);
      if (mounted) setState(() => _receipt = bytes);
    } catch (_) {
      if (mounted) setState(() => _receiptFailed = true);
    } finally {
      if (mounted) setState(() => _receiptLoading = false);
    }
  }

  Future<void> _edit() async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => ExpenseFormScreen(expense: _expense)),
    );
    if (saved == true && mounted) {
      _changed = true;
      try {
        final fresh = await ExpensesService(context.read<ApiService>()).get(_expense.id);
        if (mounted) setState(() => _expense = fresh);
      } catch (_) {}
      _loadReceipt();
    }
  }

  void _zoom() {
    final img = _receipt;
    if (img == null) return;
    showDialog<void>(
      context: context,
      builder: (_) => Dialog.fullscreen(
        child: Stack(children: [
          InteractiveViewer(minScale: 0.8, maxScale: 6, child: Center(child: Image.memory(img))),
          Positioned(top: 8, right: 8, child: IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop())),
        ]),
      ),
    );
  }

  String _methodLabel(PaymentMethod m, AppLocalizations l10n) => switch (m) {
        PaymentMethod.cash => l10n.paymentMethodCash,
        PaymentMethod.creditCard => l10n.paymentMethodCreditCard,
        PaymentMethod.bankTransfer => l10n.paymentMethodBankTransfer,
        PaymentMethod.check => l10n.paymentMethodCheck,
        PaymentMethod.bit => l10n.paymentMethodBit,
        PaymentMethod.standingOrder => l10n.paymentMethodStandingOrder,
      };

  String _docTypeLabel(String code, AppLocalizations l10n) => switch (code) {
        'tax_invoice' => l10n.expenseDocTax,
        'tax_invoice_receipt' => l10n.expenseDocTaxReceipt,
        'receipt' => l10n.expenseDocReceipt,
        'invoice' => l10n.expenseDocInvoice,
        'credit_note' => l10n.expenseDocCredit,
        'cash_slip' => l10n.expenseDocCash,
        _ => l10n.expenseDocOther,
      };

  Widget _row(String label, String? value) {
    if (value == null || value.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: 4, child: Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft))),
        Expanded(flex: 6, child: SelectableText(value, style: const TextStyle(fontWeight: FontWeight.w600))),
      ]),
    );
  }

  Widget _section(String title, List<Widget> rows) => Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          const Divider(height: 14),
          ...rows,
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final e = _expense;
    final r = e.raw;
    String? s(String k) {
      final v = r[k];
      return (v == null || v.toString().isEmpty) ? null : v.toString();
    }
    String? money(String k) {
      final v = r[k];
      return v is num ? v.toStringAsFixed(2) : (v == null ? null : v.toString());
    }
    final currency = s('currency');
    final foreign = currency != null && currency != 'ILS';
    final method = e.method;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) { if (!didPop) Navigator.of(context).pop(_changed); },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.expenseDetailsTitle),
          actions: [
            IconButton(tooltip: l10n.expenseEdit, icon: const Icon(Icons.edit_outlined), onPressed: _edit),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ---- receipt -----------------------------------------------
            Text(l10n.expenseReceiptTitle, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (_receiptLoading)
              const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
            else if (_receipt != null)
              GestureDetector(
                onTap: _zoom,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.memory(_receipt!, width: double.infinity, height: 360, fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => Padding(padding: const EdgeInsets.all(12), child: Text(l10n.expenseReceiptLoadFailed))),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(_receiptFailed ? l10n.expenseReceiptLoadFailed : l10n.expenseNoReceipt, style: const TextStyle(color: AppColors.inkSoft)),
              ),

            // ---- main -----------------------------------------------------
            _section(l10n.expenseDetailsTitle, [
              _row(l10n.expenseVendorName, s('vendorName')),
              _row(l10n.expenseDescription, e.description),
              _row(l10n.expenseCategory, e.category),
              _row(l10n.expenseTransactionDate, s('transactionDate')),
              _row(l10n.expenseBookingDate, e.date),
              _row(l10n.expenseAmountIls, '₪${e.amount.toStringAsFixed(2)}'),
              if (foreign) _row(l10n.expenseCurrency, currency),
              if (foreign) _row(l10n.expenseForeignAmount, money('foreignAmount')),
              if (foreign) _row(l10n.expenseExchangeRate, s('exchangeRate')),
            ]),

            // ---- payment ----------------------------------------------------
            _section(l10n.expenseDetailsPayment, [
              _row(l10n.expenseMethod, _methodLabel(method, l10n)),
              _row(l10n.paymentCardLast4, s('cardLast4')),
              _row(l10n.paymentCardType, s('cardType')),
              _row(l10n.paymentApprovalNumber, s('approvalNumber')),
              _row(l10n.paymentInstallments, s('installments')),
              _row(l10n.paymentCheckNumber, s('checkNumber')),
              _row(l10n.paymentBankName, s('bankName')),
              _row(l10n.paymentBranchNumber, s('branchNumber')),
              _row(l10n.paymentAccountNumber, s('accountNumber')),
              _row(l10n.paymentCheckDate, s('checkDate')),
              _row(l10n.paymentReferenceNumber, s('referenceNumber')),
            ]),

            // ---- tax ---------------------------------------------------------
            _section(l10n.expenseDetailsTax, [
              _row(l10n.expenseVendorTaxId, s('vendorTaxId')),
              _row(l10n.expenseDocumentType, s('documentType') == null ? null : _docTypeLabel(s('documentType')!, l10n)),
              _row(l10n.expenseDocumentNumber, s('documentNumber')),
              _row(l10n.expenseAllocationNumber, s('allocationNumber')),
              _row(l10n.expenseVatAmount, money('vatAmount')),
              _row(l10n.expenseVatRate, s('vatRate')),
              _row(l10n.expenseVatDeductible, s('vatDeductiblePercent') == null ? null : '${s('vatDeductiblePercent')}%'),
            ]),

            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _edit,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: Text(l10n.expenseEdit),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
