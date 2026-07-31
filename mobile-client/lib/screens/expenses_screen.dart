import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/expenses_service.dart';

class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({super.key});
  @override
  State<ExpensesScreen> createState() => ExpensesScreenState();
}

class ExpensesScreenState extends State<ExpensesScreen> {
  late final ExpensesService _svc;
  List<Expense> _expenses = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _svc = ExpensesService(context.read<ApiService>());
    _load();
  }

  Future<void> refresh() => _load();

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final expenses = await _svc.list();
      if (mounted) setState(() { _expenses = expenses; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(l10n.expensesTitle),
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _expenses.isEmpty
                ? Center(child: Text(l10n.expensesNoneYet, style: const TextStyle(color: AppColors.inkSoft)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _expenses.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final e = _expenses[i];
                        return Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: AppColors.stampWash,
                              child: Icon(
                                e.method == 'cash' ? Icons.payments_outlined : Icons.account_balance_outlined,
                                color: AppColors.stamp, size: 20,
                              ),
                            ),
                            title: Text(e.description, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Text(
                              [e.date, if (e.category != null) e.category!].join('  ·  '),
                              style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
                            ),
                            trailing: Text('₪${e.amount.toStringAsFixed(2)}',
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
