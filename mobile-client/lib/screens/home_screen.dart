import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import '../services/api_service.dart';
import '../services/calls_service.dart';
import '../services/quotes_service.dart';
import '../services/order_service.dart';
import '../services/invoices_service.dart';
import '../services/returns_service.dart';
import '../services/credit_notes_service.dart';
import '../services/debit_notes_service.dart';
import '../services/expenses_service.dart';
import '../models/service_call.dart';

class _StatCardData {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  _StatCardData({required this.icon, required this.label, required this.value, required this.color});
}

/// The default tab on app open — an overview built entirely from
/// whatever the signed-in user actually has permission to see. Each
/// stat is fetched independently and gated by the same office.*
/// permission (or the broad hasOfficeAccess fallback for the 4 types
/// that don't have their own permission key yet — same note as
/// office_screen.dart/create_document_sheet.dart) the rest of the app
/// already uses, so a user with only Calls access sees just the
/// Calls card, not an empty wall of cards they can't act on.
///
/// No dedicated "/dashboard/stats" backend endpoint exists — each
/// card's number comes from calling that feature's own list()
/// endpoint and counting/summing client-side. Fine at the list sizes
/// this app deals with; would be worth a real aggregation endpoint if
/// any of these lists grow into the thousands.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => HomeScreenState();
}

class HomeScreenState extends State<HomeScreen> {
  bool _loading = true;
  List<_StatCardData> _cards = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> refresh() => _load();

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _loading = true);
    final l10n = AppLocalizations.of(context)!;
    final api = context.read<ApiService>();
    final user = context.read<AppState>().currentUser;
    final hasOfficeAccess = (user?.hasPermission('office.delivery_notes') ?? false) ||
        (user?.hasPermission('office.quotes') ?? false) ||
        (user?.hasPermission('office.invoices') ?? false) ||
        (user?.hasPermission('office.orders') ?? false) ||
        (user?.hasPermission('office.payments') ?? false);

    final cards = <_StatCardData>[];

    try {
      final calls = await CallsService(api).list();
      final openCalls = calls.where((c) => c.status != CallStatus.closed).length;
      cards.add(_StatCardData(icon: Icons.support_agent_outlined, label: l10n.homeOpenCalls, value: '$openCalls', color: AppColors.primary));
    } catch (_) {}

    if (user?.hasPermission('office.quotes') ?? false) {
      try {
        final quotes = await QuotesService(api).list();
        final draft = quotes.where((q) => q.status == QuoteStatus.draft).length;
        cards.add(_StatCardData(icon: Icons.request_quote_outlined, label: l10n.homeDraftQuotes, value: '$draft', color: AppColors.stamp));
      } catch (_) {}
    }

    if (user?.hasPermission('office.orders') ?? false) {
      try {
        final orders = await OrderService(api).list();
        cards.add(_StatCardData(icon: Icons.inventory_2_outlined, label: l10n.homeOpenOrders, value: '${orders.length}', color: AppColors.primarySoft));
      } catch (_) {}
    }

    if (user?.hasPermission('office.invoices') ?? false) {
      try {
        final invoices = await InvoicesService(api).list();
        final unpaid = invoices.where((i) => i.status != InvoiceStatus.paid && i.status != InvoiceStatus.cancelled).toList();
        final unpaidTotal = unpaid.fold<double>(0, (sum, i) => sum + i.total);
        cards.add(_StatCardData(icon: Icons.receipt_long_outlined, label: l10n.homeUnpaidInvoices, value: '${unpaid.length}', color: AppColors.stamp));
        cards.add(_StatCardData(icon: Icons.payments_outlined, label: l10n.homeAmountDue, value: '₪${unpaidTotal.toStringAsFixed(0)}', color: AppColors.primary));
      } catch (_) {}
    }

    if (hasOfficeAccess) {
      try {
        final returns = await ReturnsService(api).list();
        cards.add(_StatCardData(icon: Icons.assignment_return_outlined, label: l10n.homeReturns, value: '${returns.length}', color: AppColors.primarySoft));
      } catch (_) {}
      try {
        final creditNotes = await CreditNotesService(api).list();
        cards.add(_StatCardData(icon: Icons.receipt_long_outlined, label: l10n.homeCreditNotes, value: '${creditNotes.length}', color: AppColors.stamp));
      } catch (_) {}
      try {
        final debitNotes = await DebitNotesService(api).list();
        cards.add(_StatCardData(icon: Icons.receipt_outlined, label: l10n.homeDebitNotes, value: '${debitNotes.length}', color: AppColors.stamp));
      } catch (_) {}
      try {
        final expenses = await ExpensesService(api).list();
        final total = expenses.fold<double>(0, (sum, e) => sum + e.amount);
        cards.add(_StatCardData(icon: Icons.account_balance_wallet_outlined, label: l10n.homeExpensesTotal, value: '₪${total.toStringAsFixed(0)}', color: AppColors.primarySoft));
      } catch (_) {}
    }

    if (mounted) setState(() { _cards = cards; _loading = false; });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final user = context.watch<AppState>().currentUser;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(l10n.homeTitle),
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      l10n.homeGreeting(user?.username ?? ''),
                      style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
                    ),
                    const SizedBox(height: 14),
                    if (_cards.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 40),
                        child: Center(child: Text(l10n.homeNoStats, style: const TextStyle(color: AppColors.inkSoft))),
                      )
                    else
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 1.5,
                        children: _cards.map((c) => Card(
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Icon(c.icon, color: c.color, size: 22),
                                    Text(c.value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: c.color)),
                                    Text(c.label, style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft), maxLines: 2, overflow: TextOverflow.ellipsis),
                                  ],
                                ),
                              ),
                            )).toList(),
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}
