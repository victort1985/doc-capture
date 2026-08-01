import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import 'fleet_screen.dart';
import 'warehouse_screen.dart';
import 'transfer_screen.dart';
import 'rentals_screen.dart';

class ManagementScreen extends StatelessWidget {
  const ManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final user = context.watch<AppState>().currentUser;
    final canTransfer = user?.hasPermission('warehouseTransfer') ?? false;
    final canRentals = user?.hasPermission('office.rentals') ?? false;
    final tabCount = 2 + (canRentals ? 1 : 0) + (canTransfer ? 1 : 0);
    return DefaultTabController(
      length: tabCount,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text(l10n.managementTitle),
          bottom: TabBar(isScrollable: true, tabs: [
            Tab(icon: const Icon(Icons.directions_car_outlined), text: l10n.fleetTitle),
            Tab(icon: const Icon(Icons.warehouse_outlined), text: l10n.warehouseTitle),
            if (canRentals) Tab(icon: const Icon(Icons.inventory_2_outlined), text: l10n.rentalsTitle),
            if (canTransfer) Tab(icon: const Icon(Icons.swap_horiz), text: l10n.transferTitle),
          ]),
        ),
        body: TabBarView(children: [
          const FleetScreen(),
          const WarehouseScreen(),
          if (canRentals) const RentalsScreen(),
          if (canTransfer) const TransferScreen(),
        ]),
      ),
    );
  }
}
