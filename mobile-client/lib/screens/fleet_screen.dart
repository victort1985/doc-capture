import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/management_services.dart';
import '../services/api_service.dart';

class FleetScreen extends StatefulWidget {
  const FleetScreen({super.key});
  @override
  State<FleetScreen> createState() => _FleetScreenState();
}

class _FleetScreenState extends State<FleetScreen> {
  late FleetService _svc;
  List<Vehicle> _vehicles = [];
  List<Map<String, dynamic>> _reminders = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _svc = FleetService(context.read<ApiService>());
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final v = await _svc.listVehicles();
      final r = await _svc.listReminders();
      if (mounted) setState(() { _vehicles = v; _reminders = r; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    if (_loading) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: _load,
      child: CustomScrollView(slivers: [
        // Reminders banner
        if (_reminders.isNotEmpty)
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.all(12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.15),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.orange.withOpacity(0.4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 18),
                    const SizedBox(width: 6),
                    Text(l10n.fleetRemindersTitle, style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.orange)),
                  ]),
                  const SizedBox(height: 6),
                  ..._reminders.map((r) {
                    final v = r['vehicle'];
                    final type = r['type'] == 'inspection' ? l10n.fleetInspection : l10n.fleetTest;
                    final due = r['dueDate'] ?? '';
                    return Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text('• ${v['make']} ${v['model']} (${v['licensePlate']}) — $type: $due'),
                    );
                  }),
                ],
              ),
            ),
          ),

        // Vehicles list
        SliverList(
          delegate: SliverChildBuilderDelegate(
            (ctx, i) => _VehicleTile(vehicle: _vehicles[i], svc: _svc, onRefresh: _load),
            childCount: _vehicles.length,
          ),
        ),

        if (_vehicles.isEmpty)
          SliverFillRemaining(
            child: Center(child: Text(l10n.fleetNoVehicles, style: const TextStyle(color: AppColors.inkSoft))),
          ),
      ]),
    );
  }
}

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({required this.vehicle, required this.svc, required this.onRefresh});
  final Vehicle vehicle;
  final FleetService svc;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.directions_car, size: 20)),
        title: Text('${vehicle.make} ${vehicle.model}', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(vehicle.licensePlate),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(
            icon: const Icon(Icons.local_gas_station_outlined, size: 20),
            tooltip: l10n.fleetAddRefuel,
            onPressed: () => _showRefuelDialog(context, l10n),
          ),
          const Icon(Icons.chevron_right, size: 18),
        ]),
        onTap: () => _showRefuelHistory(context, l10n),
      ),
    );
  }

  Future<void> _showRefuelDialog(BuildContext context, AppLocalizations l10n) async {
    final litersCtrl = TextEditingController();
    final costCtrl = TextEditingController();
    final odomCtrl = TextEditingController();
    final stationCtrl = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(l10n.fleetAddRefuel),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: litersCtrl, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.fleetLiters)),
          TextField(controller: costCtrl, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.fleetCost)),
          TextField(controller: odomCtrl, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.fleetOdometer)),
          TextField(controller: stationCtrl, decoration: InputDecoration(labelText: l10n.fleetStation)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () async {
              final liters = double.tryParse(litersCtrl.text);
              if (liters == null) return;
              await svc.addRefuel(vehicle.id, {
                'date': DateTime.now().toIso8601String().slice(0, 10),
                'liters': liters,
                if (costCtrl.text.isNotEmpty) 'cost': double.tryParse(costCtrl.text),
                if (odomCtrl.text.isNotEmpty) 'odometer': int.tryParse(odomCtrl.text),
                if (stationCtrl.text.isNotEmpty) 'station': stationCtrl.text,
              });
              if (context.mounted) Navigator.pop(context);
              onRefresh();
            },
            child: Text(l10n.calendarSave),
          ),
        ],
      ),
    );
  }

  Future<void> _showRefuelHistory(BuildContext context, AppLocalizations l10n) async {
    final refuels = await svc.listRefuels(vehicle.id);
    if (!context.mounted) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        minChildSize: 0.3,
        expand: false,
        builder: (_, ctrl) => Column(children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text('${vehicle.make} ${vehicle.model} — ${l10n.fleetRefuelHistory}',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          ),
          Expanded(
            child: refuels.isEmpty
                ? Center(child: Text(l10n.fleetNoRefuels, style: const TextStyle(color: AppColors.inkSoft)))
                : ListView.separated(
                    controller: ctrl,
                    itemCount: refuels.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final r = refuels[i];
                      return ListTile(
                        leading: const Icon(Icons.local_gas_station_outlined),
                        title: Text('${r.liters.toStringAsFixed(1)} L${r.cost != null ? ' • ₪${r.cost!.toStringAsFixed(0)}' : ''}'),
                        subtitle: Text('${r.date}${r.odometer != null ? ' • ${r.odometer} km' : ''}${r.station != null ? ' • ${r.station}' : ''}'),
                      );
                    },
                  ),
          ),
        ]),
      ),
    );
  }
}

extension _StringSlice on String {
  String slice(int start, int end) => substring(start, end < length ? end : length);
}
