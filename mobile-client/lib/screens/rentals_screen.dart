import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/rentals_service.dart';
import '../services/time_thresholds_service.dart';
import 'rental_form_screen.dart';

/// Same color-field convention used for calls/vehicles: the WHOLE
/// card colors, not a small dot — a deliberate readability choice
/// from how this was specified, not an oversight.
Color? _urgencyColor(int daysUntilDue, TimeThresholds t) {
  if (daysUntilDue <= t.rentalDangerDays) return const Color(0xFFFDEDEC); // red-tinted
  if (daysUntilDue <= t.rentalWarningDays) return const Color(0xFFFEF9E7); // yellow-tinted
  return null;
}

class RentalsScreen extends StatefulWidget {
  const RentalsScreen({super.key});
  @override
  State<RentalsScreen> createState() => RentalsScreenState();
}

class RentalsScreenState extends State<RentalsScreen> {
  List<Rental> _rentals = [];
  TimeThresholds _thresholds = const TimeThresholds();
  RentalStatus? _statusFilter = RentalStatus.active;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> refresh() => _load();

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final results = await Future.wait([
        RentalsService(api).list(status: _statusFilter),
        TimeThresholdsService(api).get(),
      ]);
      if (mounted) {
        setState(() {
          _rentals = results[0] as List<Rental>;
          _thresholds = results[1] as TimeThresholds;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markReturned(Rental r) async {
    try {
      await RentalsService(context.read<ApiService>()).markReturned(r.id);
      _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.rentalsTitle), backgroundColor: Colors.transparent),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final created = await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RentalFormScreen()));
          if (created == true) _load();
        },
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(children: [
                ChoiceChip(
                  label: Text(l10n.rentalsStatusActive),
                  selected: _statusFilter == RentalStatus.active,
                  onSelected: (_) { setState(() => _statusFilter = RentalStatus.active); _load(); },
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(l10n.rentalsStatusReturned),
                  selected: _statusFilter == RentalStatus.returned,
                  onSelected: (_) { setState(() => _statusFilter = RentalStatus.returned); _load(); },
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(l10n.rentalsStatusAll),
                  selected: _statusFilter == null,
                  onSelected: (_) { setState(() => _statusFilter = null); _load(); },
                ),
              ]),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _rentals.isEmpty
                      ? Center(child: Text(l10n.rentalsEmpty, style: const TextStyle(color: AppColors.inkSoft)))
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(12),
                            itemCount: _rentals.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (_, i) {
                              final r = _rentals[i];
                              final color = r.status == RentalStatus.active ? _urgencyColor(r.daysUntilDue, _thresholds) : null;
                              return Card(
                                color: color,
                                child: ListTile(
                                  leading: const CircleAvatar(
                                    backgroundColor: AppColors.primaryWash,
                                    child: Icon(Icons.inventory_2_outlined, color: AppColors.primary, size: 20),
                                  ),
                                  title: Text('${r.warehouseItem?.name ?? ''} × ${r.quantity}', style: const TextStyle(fontWeight: FontWeight.w600)),
                                  subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text('${r.rentalNumber ?? '#${r.id}'} · ${r.clientName}', style: const TextStyle(fontSize: 12)),
                                    Text('${l10n.rentalsDueDate}: ${r.dueDate}', style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
                                  ]),
                                  trailing: r.status == RentalStatus.active
                                      ? IconButton(
                                          icon: const Icon(Icons.assignment_return_outlined, size: 20),
                                          tooltip: l10n.rentalsMarkReturned,
                                          onPressed: () => _markReturned(r),
                                        )
                                      : Icon(Icons.check_circle_outline, color: AppColors.inkSoft, size: 20),
                                ),
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
