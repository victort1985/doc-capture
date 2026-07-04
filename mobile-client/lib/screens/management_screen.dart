import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import 'fleet_screen.dart';
import 'warehouse_screen.dart';
import 'transfer_screen.dart';

class ManagementScreen extends StatelessWidget {
  const ManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final canTransfer = context.watch<AppState>().currentUser?.hasPermission('warehouseTransfer') ?? false;
    final tabCount = canTransfer ? 3 : 2;
    return DefaultTabController(
      length: tabCount,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text(l10n.managementTitle),
          bottom: TabBar(tabs: [
            Tab(icon: const Icon(Icons.directions_car_outlined), text: l10n.fleetTitle),
            Tab(icon: const Icon(Icons.warehouse_outlined), text: l10n.warehouseTitle),
            if (canTransfer) Tab(icon: const Icon(Icons.swap_horiz), text: l10n.transferTitle),
          ]),
        ),
        body: TabBarView(children: [
          const FleetScreen(),
          const WarehouseScreen(),
          if (canTransfer) const TransferScreen(),
        ]),
      ),
    );
  }
}
