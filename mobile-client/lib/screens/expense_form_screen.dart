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
  bool _parsingReceipt = false;
  bool _saving = false;

  // --- receipt scanner state ---------------------------------------
  ReceiptScan? _scan;
  /// field name (server naming) -> 'high' | 'low' for values the scanner filled in
  Map<String, String> _auto = {};
  bool _confirmed = false;
  bool _dateTouched = false;
  bool _vatTouched = false;
  DateTime? _transactionDate;
  String _documentType = '';
  String _vatDeductible = '100';
  final _vendorController = TextEditingController();
  final _vendorTaxIdController = TextEditingController();
  final _documentNumberController = TextEditingController();
  final _allocationController = TextEditingController();
  final _vatAmountController = TextEditingController();
  final _vatRateController = TextEditingController(text: '18');
  final _currencyController = TextEditingController(text: 'ILS');
  final _foreignAmountController = TextEditingController();
  final _exchangeRateController = TextEditingController();

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
    if (picked != null) setState(() { _date = picked; _dateTouched = true; });
  }

  Future<void> _pickReceiptFromCamera() async {
    final photo = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 90);
    if (photo == null || !mounted) return;
    await _useReceiptPhoto(File(photo.path));
  }

  Future<void> _pickReceiptFromGallery() async {
    final photo = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (photo == null || !mounted) return;
    await _useReceiptPhoto(File(photo.path));
  }

  bool get _isForeign {
    final c = _currencyController.text.trim().toUpperCase();
    return c.isNotEmpty && c != 'ILS';
  }

  double? _parseNum(String text) => double.tryParse(text.trim().replaceAll(',', '.'));

  /// The ILS amount that gets booked: the typed amount, or
  /// foreign amount x exchange rate for a receipt in another currency.
  double? get _amountIls {
    if (_isForeign) {
      final f = _parseNum(_foreignAmountController.text);
      final r = _parseNum(_exchangeRateController.text);
      if (f == null || r == null) return null;
      return (f * r * 100).round() / 100;
    }
    return _parseNum(_amountController.text);
  }

  void _clearCue(String key) {
    if (_auto.containsKey(key)) setState(() => _auto = Map.of(_auto)..remove(key));
  }

  /// Scanner-filled fields: yellow = less certain, green tint = confident.
  InputDecoration _dec(String label, String key, {String? prefix}) {
    final c = _auto[key];
    return InputDecoration(
      labelText: label,
      prefixText: prefix,
      filled: c != null,
      fillColor: c == 'low' ? const Color(0x33FACC15) : (c == 'high' ? const Color(0x1F2E9E5B) : null),
    );
  }

  void _syncVat() {
    if (_vatTouched) return;
    final total = _isForeign ? null : _parseNum(_amountController.text);
    final rate = _parseNum(_vatRateController.text) ?? 0;
    if (total != null && total > 0 && rate > 0) {
      final v = ((total * rate / (100 + rate)) * 100).round() / 100;
      _vatAmountController.text = v.toString();
    } else {
      _vatAmountController.text = '';
    }
  }

  String _categoryLabel(String code, AppLocalizations l10n) => switch (code) {
        'fuel' => l10n.expenseCatFuel,
        'food' => l10n.expenseCatFood,
        'groceries' => l10n.expenseCatGroceries,
        'office' => l10n.expenseCatOffice,
        'transport' => l10n.expenseCatTransport,
        'telecom' => l10n.expenseCatTelecom,
        'utilities' => l10n.expenseCatUtilities,
        'materials' => l10n.expenseCatMaterials,
        'repairs' => l10n.expenseCatRepairs,
        'insurance' => l10n.expenseCatInsurance,
        _ => code,
      };

  PaymentMethod? _methodFromServer(String? v) => switch (v) {
        'cash' => PaymentMethod.cash,
        'credit_card' => PaymentMethod.creditCard,
        'check' => PaymentMethod.check,
        'bank_transfer' => PaymentMethod.bankTransfer,
        'bit' => PaymentMethod.bit,
        _ => null,
      };

  /// Fills the form from the scanner's result. A fresh scan overwrites
  /// the fields it found (the person asked for a scan); everything stays
  /// editable and nothing is saved until they confirm.
  void _applyScan(ReceiptScan scan, AppLocalizations l10n) {
    final f = scan.fields;
    final conf = scan.confidence;
    final auto = <String, String>{};
    String? str(String k) {
      final v = f[k];
      return (v is String && v.trim().isNotEmpty) ? v.trim() : null;
    }
    double? num_(String k) => (f[k] is num) ? (f[k] as num).toDouble() : null;
    void mark(String k) => auto[k] = conf[k] ?? 'high';

    final vendor = str('vendorName');
    if (vendor != null) {
      _vendorController.text = vendor;
      if (_descriptionController.text.trim().isEmpty) _descriptionController.text = vendor;
      mark('vendorName');
    }
    final taxId = str('vendorTaxId');
    if (taxId != null) { _vendorTaxIdController.text = taxId; mark('vendorTaxId'); }
    final docType = str('documentType');
    if (docType != null) { _documentType = docType; mark('documentType'); }
    final docNo = str('documentNumber');
    if (docNo != null) { _documentNumberController.text = docNo; mark('documentNumber'); }
    final alloc = str('allocationNumber');
    if (alloc != null) { _allocationController.text = alloc; mark('allocationNumber'); }
    final td = DateTime.tryParse(str('transactionDate') ?? '');
    if (td != null) {
      _transactionDate = td;
      if (!_dateTouched) _date = td;
      mark('transactionDate');
    }
    final cur = str('currency');
    final currency = (cur != null && RegExp(r'^[A-Z]{3}$').hasMatch(cur)) ? cur : 'ILS';
    _currencyController.text = currency;
    if (cur != null) mark('currency');
    final total = num_('total');
    if (total != null) {
      if (currency == 'ILS') {
        _amountController.text = total.toStringAsFixed(2);
        _foreignAmountController.text = '';
      } else {
        _foreignAmountController.text = total.toStringAsFixed(2);
        _amountController.text = '';
      }
      mark('total');
    }
    final rate = num_('vatRate');
    if (rate != null) { _vatRateController.text = rate.toString(); mark('vatRate'); }
    final vat = num_('vatAmount');
    if (vat != null) {
      _vatAmountController.text = vat.toStringAsFixed(2);
      _vatTouched = true;
      mark('vatAmount');
    } else {
      _vatTouched = false;
      _syncVat();
    }
    final m = _methodFromServer(str('paymentMethod'));
    if (m != null) { _method = m; mark('paymentMethod'); }
    final c4 = str('cardLast4');
    if (c4 != null) { _cardLast4Controller.text = c4; mark('cardLast4'); }
    final ct = str('cardType')?.toLowerCase();
    if (ct != null && const ['visa', 'mastercard', 'isracard', 'amex', 'diners'].contains(ct)) _cardType = ct;
    final ap = str('approvalNumber');
    if (ap != null) { _approvalNumberController.text = ap; mark('approvalNumber'); }
    final inst = f['installments'];
    if (inst is num) _installmentsController.text = inst.toInt().toString();
    final cat = str('categoryCode');
    if (cat != null && _categoryController.text.trim().isEmpty) {
      _categoryController.text = _categoryLabel(cat, l10n);
      auto['categoryCode'] = 'low';
    }
    _auto = auto;
    _confirmed = false;
  }

  /// Shared by both camera and gallery pick: sends the photo to the
  /// scanner (crop + straighten + clean + language detection + field
  /// extraction on the server) and pre-fills the form. A failed scan
  /// just leaves the form fillable by hand.
  Future<void> _useReceiptPhoto(File photo) async {
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _receiptPhoto = photo;
      _parsingReceipt = true;
    });
    try {
      final svc = ExpensesService(context.read<ApiService>());
      final scan = await svc.scanReceipt(photo);
      if (!mounted) return;
      setState(() {
        _scan = scan;
        _applyScan(scan, l10n);
      });
    } catch (_) {
      if (mounted) {
        setState(() => _scan = null);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.expenseScanFailed)));
      }
    } finally {
      if (mounted) setState(() => _parsingReceipt = false);
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

  Future<void> _pickTransactionDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _transactionDate ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365 * 3)),
      lastDate: DateTime.now().add(const Duration(days: 2)),
    );
    if (picked != null) {
      setState(() {
        _transactionDate = picked;
        if (!_dateTouched) _date = picked;
        _auto = Map.of(_auto)..remove('transactionDate');
      });
    }
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;
    final amount = _amountIls;
    if (_descriptionController.text.trim().isEmpty || amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.expenseFormInvalid)));
      return;
    }
    if (_scan != null && !_confirmed) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.expenseNeedConfirm)));
      return;
    }
    setState(() => _saving = true);
    try {
      final svc = ExpensesService(context.read<ApiService>());
      final foreign = _isForeign;
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
        transactionDate: _transactionDate?.toIso8601String().substring(0, 10),
        vendorName: _vendorController.text.trim(),
        vendorTaxId: _vendorTaxIdController.text.trim(),
        documentType: _documentType,
        documentNumber: _documentNumberController.text.trim(),
        allocationNumber: _allocationController.text.trim(),
        vatAmount: _parseNum(_vatAmountController.text),
        vatRate: _parseNum(_vatRateController.text),
        vatDeductiblePercent: _vatDeductible == '100' ? null : double.tryParse(_vatDeductible),
        currency: foreign ? _currencyController.text.trim().toUpperCase() : null,
        foreignAmount: foreign ? _parseNum(_foreignAmountController.text) : null,
        exchangeRate: foreign ? _parseNum(_exchangeRateController.text) : null,
        scanLanguage: _scan?.language,
      );
      // A failed receipt upload shouldn't undo an already-successful
      // expense creation — the expense itself is the important part;
      // the receipt image is attached after the fact.
      try {
        if (_scan?.image != null) {
          await svc.attachReceiptBytes(created.id, _scan!.image!);
        } else if (_receiptPhoto != null) {
          await svc.attachReceipt(created.id, _receiptPhoto!);
        }
      } catch (_) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.expenseReceiptUploadError)));
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.expenseSaveError)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _langLabel(String code, AppLocalizations l10n) => switch (code) {
        'he' => l10n.expenseLangHe,
        'ru' => l10n.expenseLangRu,
        'ar' => l10n.expenseLangAr,
        _ => l10n.expenseLangEn,
      };

  String _docTypeLabel(String code, AppLocalizations l10n) => switch (code) {
        'tax_invoice' => l10n.expenseDocTax,
        'tax_invoice_receipt' => l10n.expenseDocTaxReceipt,
        'receipt' => l10n.expenseDocReceipt,
        'invoice' => l10n.expenseDocInvoice,
        'credit_note' => l10n.expenseDocCredit,
        'cash_slip' => l10n.expenseDocCash,
        'other' => l10n.expenseDocOther,
        _ => l10n.expenseDocTypeNone,
      };

  Widget _chip(String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: Colors.black.withOpacity(0.06), borderRadius: BorderRadius.circular(6)),
        child: Text(text, style: const TextStyle(fontSize: 12)),
      );

  Widget _dateTile(String label, DateTime? value, VoidCallback onTap, {String? cueKey}) {
    final c = cueKey == null ? null : _auto[cueKey];
    return Container(
      decoration: c == null
          ? null
          : BoxDecoration(
              color: c == 'low' ? const Color(0x33FACC15) : const Color(0x1F2E9E5B),
              borderRadius: BorderRadius.circular(8),
            ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 8),
        title: Text(label),
        subtitle: Text(value == null ? '—' : value.toIso8601String().substring(0, 10)),
        trailing: const Icon(Icons.calendar_today_outlined, size: 18),
        onTap: onTap,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scan = _scan;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.expenseNew)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ---- scanner ------------------------------------------------
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: _parsingReceipt ? null : _pickReceiptFromCamera,
                icon: const Icon(Icons.document_scanner_outlined, size: 18),
                label: Text(l10n.expenseScanReceipt),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _parsingReceipt ? null : _pickReceiptFromGallery,
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: Text(l10n.expenseScanFromGallery),
              ),
            ),
          ]),
          if (_parsingReceipt)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(children: [
                const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                const SizedBox(width: 8),
                Expanded(child: Text(l10n.expenseScanning, style: const TextStyle(fontSize: 12.5))),
              ]),
            ),
          if (scan != null) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 6, children: [
              _chip('${l10n.expenseScanLanguage}: ${_langLabel(scan.language, l10n)}'),
              _chip(scan.cropped ? l10n.expenseScanCropped : l10n.expenseScanNotCropped),
            ]),
            const SizedBox(height: 8),
            Text(l10n.expenseScanReviewNotice, style: const TextStyle(fontSize: 12.5)),
            if (scan.warnings.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(scan.warnings.join(' · '), style: const TextStyle(fontSize: 11.5, color: Colors.redAccent)),
              ),
            const SizedBox(height: 8),
            if (scan.image != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.memory(scan.image!, height: 240, width: double.infinity, fit: BoxFit.contain),
              ),
          ] else if (_receiptPhoto != null) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.file(_receiptPhoto!, height: 160, width: double.infinity, fit: BoxFit.cover),
            ),
          ],
          if (_receiptPhoto != null)
            TextButton(
              onPressed: () => setState(() {
                _receiptPhoto = null;
                _scan = null;
                _auto = {};
                _confirmed = false;
              }),
              child: Text(l10n.expenseReceiptRemove),
            ),
          const SizedBox(height: 14),

          // ---- dates --------------------------------------------------
          _dateTile(l10n.expenseTransactionDate, _transactionDate, _pickTransactionDate, cueKey: 'transactionDate'),
          _dateTile(l10n.expenseBookingDate, _date, _pickDate),
          const SizedBox(height: 6),

          // ---- main fields -------------------------------------------
          TextField(controller: _vendorController, onChanged: (_) => _clearCue('vendorName'), decoration: _dec(l10n.expenseVendorName, 'vendorName')),
          const SizedBox(height: 10),
          TextField(controller: _descriptionController, decoration: InputDecoration(labelText: l10n.expenseDescription)),
          const SizedBox(height: 10),
          TextField(controller: _categoryController, onChanged: (_) => _clearCue('categoryCode'), decoration: _dec(l10n.expenseCategory, 'categoryCode')),
          const SizedBox(height: 10),
          Row(children: [
            SizedBox(
              width: 96,
              child: TextField(
                controller: _currencyController,
                maxLength: 3,
                textCapitalization: TextCapitalization.characters,
                onChanged: (_) { _clearCue('currency'); setState(() {}); },
                decoration: _dec(l10n.expenseCurrency, 'currency').copyWith(counterText: ''),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _isForeign
                  ? TextField(
                      controller: _foreignAmountController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (_) { _clearCue('total'); setState(() {}); },
                      decoration: _dec(l10n.expenseForeignAmount, 'total'),
                    )
                  : TextField(
                      controller: _amountController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (_) { _clearCue('total'); setState(_syncVat); },
                      decoration: _dec(l10n.expenseAmount, 'total', prefix: '₪ '),
                    ),
            ),
          ]),
          if (_isForeign) ...[
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _exchangeRateController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(labelText: l10n.expenseExchangeRate),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: InputDecorator(
                  decoration: InputDecoration(labelText: l10n.expenseAmount),
                  child: Text(_amountIls == null ? '—' : '₪ ${_amountIls!.toStringAsFixed(2)}'),
                ),
              ),
            ]),
          ],
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _vatAmountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) { _vatTouched = true; _clearCue('vatAmount'); },
                decoration: _dec(l10n.expenseVatAmount, 'vatAmount'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _vatRateController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) { _clearCue('vatRate'); setState(_syncVat); },
                decoration: _dec(l10n.expenseVatRate, 'vatRate'),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: _vatDeductible,
            decoration: InputDecoration(labelText: l10n.expenseVatDeductible),
            items: [
              DropdownMenuItem(value: '100', child: Text(l10n.expenseVatFull)),
              DropdownMenuItem(value: '66.67', child: Text(l10n.expenseVat2of3)),
              DropdownMenuItem(value: '25', child: Text(l10n.expenseVatQuarter)),
              DropdownMenuItem(value: '0', child: Text(l10n.expenseVatNone)),
            ],
            onChanged: (v) => setState(() => _vatDeductible = v ?? '100'),
          ),

          // ---- tax reporting data ----------------------------------------
          const SizedBox(height: 16),
          Text(l10n.expenseTaxSection, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          TextField(controller: _vendorTaxIdController, keyboardType: TextInputType.number, onChanged: (_) => _clearCue('vendorTaxId'), decoration: _dec(l10n.expenseVendorTaxId, 'vendorTaxId')),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _documentType,
                isExpanded: true,
                decoration: _dec(l10n.expenseDocumentType, 'documentType'),
                items: ['', 'tax_invoice', 'tax_invoice_receipt', 'receipt', 'invoice', 'credit_note', 'cash_slip', 'other']
                    .map((c) => DropdownMenuItem(value: c, child: Text(_docTypeLabel(c, l10n), overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: (v) { _clearCue('documentType'); setState(() => _documentType = v ?? ''); },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _documentNumberController, onChanged: (_) => _clearCue('documentNumber'), decoration: _dec(l10n.expenseDocumentNumber, 'documentNumber'))),
          ]),
          const SizedBox(height: 10),
          TextField(controller: _allocationController, keyboardType: TextInputType.number, onChanged: (_) => _clearCue('allocationNumber'), decoration: _dec(l10n.expenseAllocationNumber, 'allocationNumber')),

          // ---- payment ---------------------------------------------------
          const SizedBox(height: 14),
          DropdownButtonFormField<PaymentMethod>(
            value: _method,
            decoration: _dec(l10n.expenseMethod, 'paymentMethod'),
            items: PaymentMethod.values.map((m) => DropdownMenuItem(value: m, child: Text(_methodLabel(m, l10n)))).toList(),
            onChanged: (v) { _clearCue('paymentMethod'); setState(() => _method = v ?? PaymentMethod.cash); },
          ),
          ..._methodSpecificFields(l10n),

          // ---- confirm & save -----------------------------------------------
          const SizedBox(height: 16),
          if (scan != null)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _confirmed,
              onChanged: (v) => setState(() => _confirmed = v ?? false),
              title: Text(l10n.expenseConfirmChecked),
            ),
          const SizedBox(height: 6),
          FilledButton(
            onPressed: (_saving || _parsingReceipt || (scan != null && !_confirmed)) ? null : _save,
            child: Text(_saving ? '…' : (scan != null ? l10n.expenseConfirmAndSave : l10n.expenseSave)),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
