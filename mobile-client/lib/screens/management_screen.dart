import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import 'fleet_screen.dart';
import 'warehouse_screen.dart';
import 'warehouse_transfers_screen.dart';

class ManagementScreen extends StatelessWidget {
  const ManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text(l10n.managementTitle),
          bottom: TabBar(tabs: [
            Tab(icon: const Icon(Icons.directions_car_outlined), text: l10n.fleetTitle),
            Tab(icon: const Icon(Icons.warehouse_outlined), text: l10n.warehouseTitle),
            const Tab(icon: Icon(Icons.swap_horiz_outlined), text: 'Transfers'),
          ]),
        ),
        body: const TabBarView(children: [
          FleetScreen(),
          WarehouseScreen(),
          WarehouseTransfersScreen(),
        ]),
      ),
    );
  }
}
