import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/debit_notes_service.dart';
import 'credit_debit_form_screen.dart';

class DebitNotesScreen extends StatefulWidget {
  const DebitNotesScreen({super.key});
  @override
  State<DebitNotesScreen> createState() => DebitNotesScreenState();
}

class DebitNotesScreenState extends State<DebitNotesScreen> {
  late final DebitNotesService _svc;
  List<DebitNote> _notes = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _svc = DebitNotesService(context.read<ApiService>());
    _load();
  }

  Future<void> refresh() => _load();

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final notes = await _svc.list();
      if (mounted) setState(() { _notes = notes; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _currencySymbol(String code) => switch (code) {
        'USD' => '\$',
        'EUR' => '€',
        'GBP' => '£',
        _ => '₪',
      };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(l10n.debitNotesTitle),
        backgroundColor: Colors.transparent,
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final created = await Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => const CreditDebitFormScreen(kind: CreditDebitKind.debit),
          ));
          if (created == true) _load();
        },
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _notes.isEmpty
                ? Center(child: Text(l10n.debitNotesNoneYet, style: const TextStyle(color: AppColors.inkSoft)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _notes.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final n = _notes[i];
                        return Card(
                          child: ListTile(
                            leading: const CircleAvatar(
                              backgroundColor: AppColors.primaryWash,
                              child: Icon(Icons.receipt_outlined, color: AppColors.primary, size: 20),
                            ),
                            title: Text(n.clientName, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              if (n.debitNoteNumber != null) Text('№ ${n.debitNoteNumber}  ·  ${n.date ?? ''}', style: const TextStyle(fontSize: 12)),
                              Text(n.reason, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft), maxLines: 2, overflow: TextOverflow.ellipsis),
                            ]),
                            trailing: Text('${_currencySymbol(n.currency)}${n.total.toStringAsFixed(2)}',
                                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary)),
                          ),
                        );
                      },
                    ),
                  ),
      ),
    );
  }
}
