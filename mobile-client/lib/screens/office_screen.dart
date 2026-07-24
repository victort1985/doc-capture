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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final user = context.watch<AppState>().currentUser;

    final items = <(String, IconData, Widget)>[
      if (user?.hasPermission('office.quotes') ?? false)
        (l10n.quotesTitle, Icons.request_quote_outlined, const QuotesScreen()),
      if (user?.hasPermission('office.orders') ?? false)
        (l10n.navOrders, Icons.inventory_2_outlined, const OrdersScreen()),
      if (user?.hasPermission('office.delivery_notes') ?? false)
        (l10n.deliveryNotesTitle, Icons.assignment_outlined, const DeliveryNotesScreen()),
      if (user?.hasPermission('office.invoices') ?? false)
        (l10n.invoicesTitle, Icons.receipt_long_outlined, const InvoicesScreen()),
      if (user?.hasPermission('office.payments') ?? false)
        (l10n.paymentsTitle, Icons.payments_outlined, const PaymentsScreen()),
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
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _subIndex = i),
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
                          children: [
                            Icon(items[i].$2, size: 20, color: i == index ? AppColors.primary : AppColors.inkSoft),
                            const SizedBox(height: 3),
                            Text(items[i].$1, style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: i == index ? FontWeight.w700 : FontWeight.w500,
                              color: i == index ? AppColors.primary : AppColors.inkSoft,
                            )),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        Expanded(child: IndexedStack(index: index, children: items.map((e) => e.$3).toList())),
      ],
    );
  }
}
