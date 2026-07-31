import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import 'organization_logo_background.dart';
import '../screens/quotes_screen.dart';
import '../screens/orders_screen.dart';
import '../screens/delivery_notes_screen.dart';
import '../screens/returns_screen.dart';
import '../screens/invoices_screen.dart';
import '../screens/credit_notes_screen.dart';
import '../screens/debit_notes_screen.dart';
import '../screens/payments_screen.dart';
import '../screens/expenses_screen.dart';

class _DocShortcut {
  final IconData icon;
  final String Function(AppLocalizations) label;
  final Widget Function() open;
  final bool isNew;
  const _DocShortcut({required this.icon, required this.label, required this.open, this.isNew = false});
}

/// Shows a grid of every document type as a one-tap shortcut — the
/// "Action Hub" nav style's replacement for digging through the
/// classic nav's Office sub-tabs. Each existing type (quotes/orders/
/// delivery notes/invoices/payments) still respects its own
/// office.* permission exactly like OfficeScreen does. The 4 new
/// types (returns/credit notes/debit notes/expenses) don't have
/// their own permission keys yet on the backend — see
/// permissions.constants.ts — so they're shown whenever the user has
/// ANY office.* access at all, the same broad gate root_screen.dart
/// already uses to decide whether to show the Office tab in the
/// first place. Worth tightening once dedicated permission keys
/// exist for these.
Future<void> showCreateDocumentSheet(BuildContext context, {required bool hasOfficeAccess}) {
  final l10n = AppLocalizations.of(context)!;
  final user = context.read<AppState>().currentUser;

  final shortcuts = <_DocShortcut>[
    if (user?.hasPermission('office.quotes') ?? false)
      _DocShortcut(icon: Icons.request_quote_outlined, label: (l) => l.quotesTitle, open: () => const QuotesScreen()),
    if (user?.hasPermission('office.orders') ?? false)
      _DocShortcut(icon: Icons.inventory_2_outlined, label: (l) => l.navOrders, open: () => const OrdersScreen()),
    if (user?.hasPermission('office.delivery_notes') ?? false)
      _DocShortcut(icon: Icons.assignment_outlined, label: (l) => l.deliveryNotesTitle, open: () => const DeliveryNotesScreen()),
    if (hasOfficeAccess)
      _DocShortcut(icon: Icons.assignment_return_outlined, label: (l) => l.returnsTitle, open: () => const ReturnsScreen(), isNew: true),
    if (user?.hasPermission('office.invoices') ?? false)
      _DocShortcut(icon: Icons.receipt_long_outlined, label: (l) => l.invoicesTitle, open: () => const InvoicesScreen()),
    if (hasOfficeAccess)
      _DocShortcut(icon: Icons.receipt_long_outlined, label: (l) => l.creditNotesTitle, open: () => const CreditNotesScreen(), isNew: true),
    if (hasOfficeAccess)
      _DocShortcut(icon: Icons.receipt_outlined, label: (l) => l.debitNotesTitle, open: () => const DebitNotesScreen(), isNew: true),
    if (user?.hasPermission('office.payments') ?? false)
      _DocShortcut(icon: Icons.payments_outlined, label: (l) => l.paymentsTitle, open: () => const PaymentsScreen()),
    if (hasOfficeAccess)
      _DocShortcut(icon: Icons.account_balance_wallet_outlined, label: (l) => l.expensesTitle, open: () => const ExpensesScreen(), isNew: true),
  ];

  return showModalBottomSheet(
    context: context,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(3)),
              ),
            ),
            Text(l10n.createDocumentTitle, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.primary)),
            const SizedBox(height: 4),
            Text(l10n.createDocumentHint, style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft)),
            const SizedBox(height: 18),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 14,
              crossAxisSpacing: 10,
              children: shortcuts.map((s) => _ShortcutTile(shortcut: s, l10n: l10n)).toList(),
            ),
          ],
        ),
      ),
    ),
  );
}

class _ShortcutTile extends StatelessWidget {
  const _ShortcutTile({required this.shortcut, required this.l10n});
  final _DocShortcut shortcut;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        Navigator.of(context).pop();
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => OrganizationLogoBackground(child: shortcut.open())));
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(color: AppColors.primaryWash, borderRadius: BorderRadius.circular(14)),
                child: Icon(shortcut.icon, color: AppColors.primary, size: 21),
              ),
              if (shortcut.isNew)
                Positioned(
                  top: -4, right: -4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                    decoration: BoxDecoration(color: AppColors.stamp, borderRadius: BorderRadius.circular(20)),
                    child: const Text('NEW', style: TextStyle(fontSize: 7, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            shortcut.label(l10n),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
