import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../store/app_state.dart';
import '../l10n/app_localizations.dart';
import 'delivery_notes_screen.dart';
import 'quotes_screen.dart';
import 'invoices_screen.dart';
import 'orders_screen.dart';
import 'payments_screen.dart';
import 'returns_screen.dart';
import 'credit_notes_screen.dart';
import 'debit_notes_screen.dart';
import 'expenses_screen.dart';

/// The "Office" tab: a small sub-navigation of admin-style features
/// (delivery notes, quotes, invoices), each independently gated by an
/// office.* permission. A user only sees the sub-tabs they've been
/// granted — see resolveEffectivePermissions() server-side for how
/// that's computed (role default -> group -> per-user override).
class OfficeScreen extends StatefulWidget {
  const OfficeScreen({super.key});
  @override
  State<OfficeScreen> createState() => _OfficeScreenState();
}

class _OfficeScreenState extends State<OfficeScreen> {
  int _subIndex = 0;

  // Stable across rebuilds (unlike a GlobalKey created inline inside
  // build(), which would be a brand new key every time) — lets tab
  // switches call .refresh() on whichever screen just became visible,
  // since each one stays alive in the IndexedStack below rather than
  // being rebuilt from scratch, so it doesn't naturally re-fetch on
  // its own the way a freshly-built screen would.
  final _quotesKey = GlobalKey<QuotesScreenState>();
  final _ordersKey = GlobalKey<OrdersScreenState>();
  final _deliveryNotesKey = GlobalKey<DeliveryNotesScreenState>();
  final _invoicesKey = GlobalKey<InvoicesScreenState>();
  final _paymentsKey = GlobalKey<PaymentsScreenState>();
  final _returnsKey = GlobalKey<ReturnsScreenState>();
  final _creditNotesKey = GlobalKey<CreditNotesScreenState>();
  final _debitNotesKey = GlobalKey<DebitNotesScreenState>();
  final _expensesKey = GlobalKey<ExpensesScreenState>();

  void _selectTab(int i, List<(String, IconData, Widget, VoidCallback?)> items) {
    if (i == _subIndex) return;
    setState(() => _subIndex = i);
    items[i].$4?.call();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final user = context.watch<AppState>().currentUser;

    final items = <(String, IconData, Widget, VoidCallback?)>[
      if (user?.hasPermission('office.quotes') ?? false)
        (l10n.quotesTitle, Icons.request_quote_outlined, QuotesScreen(key: _quotesKey), () => _quotesKey.currentState?.refresh()),
      if (user?.hasPermission('office.orders') ?? false)
        (l10n.navOrders, Icons.inventory_2_outlined, OrdersScreen(key: _ordersKey), () => _ordersKey.currentState?.refresh()),
      if (user?.hasPermission('office.delivery_notes') ?? false)
        (l10n.deliveryNotesTitle, Icons.assignment_outlined, DeliveryNotesScreen(key: _deliveryNotesKey), () => _deliveryNotesKey.currentState?.refresh()),
      if (user?.hasPermission('office.returns') ?? false)
        (l10n.returnsTitle, Icons.assignment_return_outlined, ReturnsScreen(key: _returnsKey), () => _returnsKey.currentState?.refresh()),
      if (user?.hasPermission('office.invoices') ?? false)
        (l10n.invoicesTitle, Icons.receipt_long_outlined, InvoicesScreen(key: _invoicesKey), () => _invoicesKey.currentState?.refresh()),
      if (user?.hasPermission('office.credit_notes') ?? false)
        (l10n.creditNotesTitle, Icons.receipt_long_outlined, CreditNotesScreen(key: _creditNotesKey), () => _creditNotesKey.currentState?.refresh()),
      if (user?.hasPermission('office.debit_notes') ?? false)
        (l10n.debitNotesTitle, Icons.receipt_outlined, DebitNotesScreen(key: _debitNotesKey), () => _debitNotesKey.currentState?.refresh()),
      if (user?.hasPermission('office.payments') ?? false)
        (l10n.paymentsTitle, Icons.payments_outlined, PaymentsScreen(key: _paymentsKey), () => _paymentsKey.currentState?.refresh()),
      if (user?.hasPermission('office.expenses') ?? false)
        (l10n.expensesTitle, Icons.account_balance_wallet_outlined, ExpensesScreen(key: _expensesKey), () => _expensesKey.currentState?.refresh()),
    ];

    if (items.isEmpty) {
      // Shouldn't normally be reachable — root_screen only shows the
      // Office tab at all when at least one of these is granted — but
      // kept as a safe fallback rather than an index-out-of-range crash.
      return Scaffold(
        appBar: AppBar(title: Text(l10n.officeTitle)),
        body: Center(child: Text(l10n.officeNoAccess, style: const TextStyle(color: AppColors.inkSoft))),
      );
    }

    final index = _subIndex.clamp(0, items.length - 1);

    return Column(
      children: [
        Material(
          color: AppColors.surface,
          elevation: 1,
          child: SafeArea(
            bottom: false,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (var i = 0; i < items.length; i++)
                    SizedBox(
                      width: 78,
                      child: InkWell(
                        onTap: () => _selectTab(i, items),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            border: Border(
                              bottom: BorderSide(
                                color: i == index ? AppColors.primary : Colors.transparent,
                                width: 2.5,
                              ),
                            ),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(items[i].$2, size: 20, color: i == index ? AppColors.primary : AppColors.inkSoft),
                              const SizedBox(height: 3),
                              Text(
                                items[i].$1,
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: i == index ? FontWeight.w700 : FontWeight.w500,
                                  color: i == index ? AppColors.primary : AppColors.inkSoft,
                                ),
                              ),
                            ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
        Expanded(child: IndexedStack(index: index, children: items.map((e) => e.$3).toList())),
      ],
    );
  }
}
