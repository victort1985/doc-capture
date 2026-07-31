import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/rentals_service.dart';
import '../services/management_services.dart' show WarehouseItem, WarehouseService;
import '../models/contact.dart';
import '../widgets/search_picker_field.dart';
import '../widgets/contact_picker_sheet.dart';

class RentalFormScreen extends StatefulWidget {
  const RentalFormScreen({super.key});
  @override
  State<RentalFormScreen> createState() => _RentalFormScreenState();
}

class _RentalFormScreenState extends State<RentalFormScreen> {
  final _clientNameController = TextEditingController();
  final _clientPhoneController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _quantityController = TextEditingController(text: '1');

  int? _warehouseItemId;
  String? _warehouseItemLabel;
  Contact? _selectedContact;
  DateTime _startDate = DateTime.now();
  DateTime? _dueDate;
  bool _saving = false;
  List<WarehouseItem>? _warehouseCache;

  Future<List<WarehouseItem>> _searchWarehouseItems(String query) async {
    _warehouseCache ??= await WarehouseService(context.read<ApiService>()).listItems();
    final q = query.toLowerCase();
    return _warehouseCache!.where((w) => w.name.toLowerCase().contains(q) || w.barcode.toLowerCase().contains(q)).toList();
  }

  Future<void> _pickClient() async {
    final picked = await showContactPicker(context);
    if (picked == null) return;
    setState(() {
      _selectedContact = picked;
      _clientNameController.text = picked.fullName;
      _clientPhoneController.text = picked.phone;
    });
  }

  Future<void> _pickDate({required bool isDue}) async {
    final initial = isDue ? (_dueDate ?? DateTime.now().add(const Duration(days: 7))) : _startDate;
    final picked = await showDatePicker(
      context: context, initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (picked == null) return;
    setState(() { if (isDue) _dueDate = picked; else _startDate = picked; });
  }

  String _fmt(DateTime d) => d.toIso8601String().substring(0, 10);

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;
    if (_warehouseItemId == null || _clientNameController.text.trim().isEmpty || _dueDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.rentalFormInvalid)));
      return;
    }
    setState(() => _saving = true);
    try {
      await RentalsService(context.read<ApiService>()).create(
        warehouseItemId: _warehouseItemId!,
        quantity: int.tryParse(_quantityController.text) ?? 1,
        contactId: _selectedContact?.id,
        clientName: _clientNameController.text.trim(),
        clientPhone: _clientPhoneController.text.trim(),
        description: _descriptionController.text.trim(),
        startDate: _fmt(_startDate),
        dueDate: _fmt(_dueDate!),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.rentalSaveError)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.rentalsNewRental)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          OutlinedButton.icon(
            onPressed: () async {
              final picked = await showModalBottomSheet<WarehouseItem>(
                context: context,
                isScrollControlled: true,
                builder: (ctx) => Padding(
                  padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l10n.rentalPickEquipmentTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 12),
                      SearchPickerField<WarehouseItem>(
                        search: _searchWarehouseItems,
                        displayString: (w) => w.name,
                        listLabel: (w) => '${w.name} · ${w.barcode} · ${l10n.rentalInStock}: ${w.quantity}',
                        hintText: l10n.rentalPickEquipmentHint,
                        onSelected: (w) => Navigator.of(ctx).pop(w),
                      ),
                    ],
                  ),
                ),
              );
              if (picked != null) {
                setState(() { _warehouseItemId = picked.id; _warehouseItemLabel = picked.name; });
              }
            },
            icon: const Icon(Icons.inventory_2_outlined, size: 18),
            label: Text(_warehouseItemLabel == null ? l10n.rentalPickEquipmentTitle : '${l10n.rentalPickEquipmentTitle}: $_warehouseItemLabel'),
          ),
          const SizedBox(height: 10),
          TextField(controller: _quantityController, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.rentalQuantity)),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: _pickClient,
            icon: const Icon(Icons.person_outline, size: 18),
            label: Text(_selectedContact == null ? l10n.rentalPickClientTitle : _selectedContact!.fullName),
          ),
          const SizedBox(height: 10),
          TextField(controller: _clientNameController, decoration: InputDecoration(labelText: l10n.quoteClientName)),
          const SizedBox(height: 10),
          TextField(controller: _clientPhoneController, decoration: InputDecoration(labelText: l10n.rentalClientPhone)),
          const SizedBox(height: 10),
          TextField(controller: _descriptionController, decoration: InputDecoration(labelText: l10n.rentalDescription), maxLines: 2),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.rentalStartDate),
                subtitle: Text(_fmt(_startDate)),
                trailing: const Icon(Icons.calendar_today_outlined, size: 16),
                onTap: () => _pickDate(isDue: false),
              ),
            ),
            Expanded(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.rentalsDueDate),
                subtitle: Text(_dueDate == null ? '—' : _fmt(_dueDate!)),
                trailing: const Icon(Icons.calendar_today_outlined, size: 16),
                onTap: () => _pickDate(isDue: true),
              ),
            ),
          ]),
          const SizedBox(height: 20),
          FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? '…' : l10n.rentalSubmit)),
        ],
      ),
    );
  }
}
