import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/expenses_service.dart';
import '../services/payments_service.dart' show PaymentMethod;

class ExpenseFormScreen extends StatefulWidget {
  const ExpenseFormScreen({super.key});
  @override
  State<ExpenseFormScreen> createState() => _ExpenseFormScreenState();
}

class _ExpenseFormScreenState extends State<ExpenseFormScreen> {
  final _descriptionController = TextEditingController();
  final _categoryController = TextEditingController();
  final _amountController = TextEditingController();
  DateTime _date = DateTime.now();
  PaymentMethod _method = PaymentMethod.cash;
  File? _receiptPhoto;
  bool _saving = false;

  // Method-specific controllers — same set/shape as PaymentsScreen's
  // own create form, reused here rather than a narrower expense-only
  // subset, since an expense can be paid by card/check/Bit exactly
  // like a payment can be received that way.
  final _cardLast4Controller = TextEditingController();
  String _cardType = 'visa';
  final _approvalNumberController = TextEditingController();
  final _installmentsController = TextEditingController(text: '1');
  final _checkNumberController = TextEditingController();
  final _bankNameController = TextEditingController();
  final _branchNumberController = TextEditingController();
  final _accountNumberController = TextEditingController();
  DateTime? _checkDate;
  final _referenceNumberController = TextEditingController();

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickReceiptFromCamera() async {
    final photo = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 90);
    if (photo == null || !mounted) return;
    setState(() => _receiptPhoto = File(photo.path));
  }

  Future<void> _pickReceiptFromGallery() async {
    final photo = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (photo == null || !mounted) return;
    setState(() => _receiptPhoto = File(photo.path));
  }

  String _methodLabel(PaymentMethod m, AppLocalizations l10n) => switch (m) {
        PaymentMethod.cash => l10n.paymentMethodCash,
        PaymentMethod.creditCard => l10n.paymentMethodCreditCard,
        PaymentMethod.bankTransfer => l10n.paymentMethodBankTransfer,
        PaymentMethod.check => l10n.paymentMethodCheck,
        PaymentMethod.bit => l10n.paymentMethodBit,
        PaymentMethod.standingOrder => l10n.paymentMethodStandingOrder,
      };

  /// Mirrors PaymentsScreen's _methodSpecificFields exactly — only
  /// show the fields relevant to whichever method is selected.
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

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;
    final amount = double.tryParse(_amountController.text.replaceAll(',', '.'));
    if (_descriptionController.text.trim().isEmpty || amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.expenseFormInvalid)));
      return;
    }
    setState(() => _saving = true);
    try {
      final svc = ExpensesService(context.read<ApiService>());
      final created = await svc.create(
        date: _date.toIso8601String().substring(0, 10),
        description: _descriptionController.text.trim(),
        category: _categoryController.text.trim(),
        amount: amount,
        method: _method,
        cardLast4: _method == PaymentMethod.creditCard ? _cardLast4Controller.text.trim() : null,
        cardType: _method == PaymentMethod.creditCard ? _cardType : null,
        approvalNumber: _method == PaymentMethod.creditCard ? _approvalNumberController.text.trim() : null,
        installments: _method == PaymentMethod.creditCard ? int.tryParse(_installmentsController.text.trim()) : null,
        checkNumber: _method == PaymentMethod.check ? _checkNumberController.text.trim() : null,
        bankName: (_method == PaymentMethod.check || _method == PaymentMethod.bankTransfer) ? _bankNameController.text.trim() : null,
        branchNumber: _method == PaymentMethod.check ? _branchNumberController.text.trim() : null,
        accountNumber: _method == PaymentMethod.check ? _accountNumberController.text.trim() : null,
        checkDate: _method == PaymentMethod.check ? _checkDate?.toIso8601String().substring(0, 10) : null,
        referenceNumber: (_method == PaymentMethod.bankTransfer || _method == PaymentMethod.bit || _method == PaymentMethod.standingOrder)
            ? _referenceNumberController.text.trim()
            : null,
      );
      // A failed receipt upload shouldn't undo an already-successful
      // expense creation — the expense itself is the important part;
      // the receipt photo is a nice-to-have attached after the fact.
      if (_receiptPhoto != null) {
        try {
          await svc.attachReceipt(created.id, _receiptPhoto!);
        } catch (_) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.expenseReceiptUploadError)));
        }
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.expenseSaveError)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.expenseNew)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(controller: _descriptionController, decoration: InputDecoration(labelText: l10n.expenseDescription)),
          const SizedBox(height: 10),
          TextField(controller: _categoryController, decoration: InputDecoration(labelText: l10n.expenseCategory)),
          const SizedBox(height: 10),
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: l10n.expenseAmount, prefixText: '₪ '),
          ),
          const SizedBox(height: 10),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.expenseDate),
            subtitle: Text(_date.toIso8601String().substring(0, 10)),
            trailing: const Icon(Icons.calendar_today_outlined, size: 18),
            onTap: _pickDate,
          ),
          const SizedBox(height: 6),
          DropdownButtonFormField<PaymentMethod>(
            value: _method,
            decoration: InputDecoration(labelText: l10n.expenseMethod),
            items: PaymentMethod.values.map((m) => DropdownMenuItem(value: m, child: Text(_methodLabel(m, l10n)))).toList(),
            onChanged: (v) => setState(() => _method = v ?? PaymentMethod.cash),
          ),
          ..._methodSpecificFields(l10n),
          const SizedBox(height: 16),
          Text(l10n.expenseReceiptPhoto, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (_receiptPhoto != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.file(_receiptPhoto!, height: 160, width: double.infinity, fit: BoxFit.cover),
              ),
            ),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _pickReceiptFromCamera,
                icon: const Icon(Icons.camera_alt_outlined, size: 18),
                label: Text(l10n.expenseReceiptCamera),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _pickReceiptFromGallery,
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: Text(l10n.expenseReceiptGallery),
              ),
            ),
          ]),
          if (_receiptPhoto != null)
            TextButton(
              onPressed: () => setState(() => _receiptPhoto = null),
              child: Text(l10n.expenseReceiptRemove),
            ),
          const SizedBox(height: 20),
          FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? '…' : l10n.expenseSave)),
        ],
      ),
    );
  }
}
