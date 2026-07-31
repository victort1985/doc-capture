import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/expenses_service.dart';

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
  String _method = 'cash';
  bool _saving = false;

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (picked != null) setState(() => _date = picked);
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
      await svc.create(
        date: _date.toIso8601String().substring(0, 10),
        description: _descriptionController.text.trim(),
        category: _categoryController.text.trim(),
        amount: amount,
        method: _method,
      );
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
          DropdownButtonFormField<String>(
            value: _method,
            decoration: InputDecoration(labelText: l10n.expenseMethod),
            items: [
              DropdownMenuItem(value: 'cash', child: Text(l10n.expenseMethodCash)),
              DropdownMenuItem(value: 'bank', child: Text(l10n.expenseMethodBank)),
            ],
            onChanged: (v) { if (v != null) setState(() => _method = v); },
          ),
          const SizedBox(height: 20),
          FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? '…' : l10n.expenseSave)),
        ],
      ),
    );
  }
}
