import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/api_service.dart';
import '../services/management_services.dart';
import 'warehouse_transfer_form_screen.dart';

class WarehouseTransfersScreen extends StatefulWidget {
  const WarehouseTransfersScreen({super.key});

  @override
  State<WarehouseTransfersScreen> createState() => _WarehouseTransfersScreenState();
}

class _WarehouseTransfersScreenState extends State<WarehouseTransfersScreen> {
  List<WarehouseTransfer> _transfers = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<ApiService>();
    final svc = WarehouseService(api);
    try {
      final data = await svc.listTransfers();
      if (mounted) setState(() { _transfers = data; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _newTransfer() async {
    final api = context.read<ApiService>();
    final svc = WarehouseService(api);
    final result = await Navigator.of(context).push<WarehouseTransfer>(
      MaterialPageRoute(builder: (_) => WarehouseTransferFormScreen(svc: svc)),
    );
    if (result != null) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _transfers.isEmpty
          ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.swap_horiz, size: 48, color: AppColors.inkSoft),
              const SizedBox(height: 12),
              const Text('No transfers yet', style: TextStyle(color: AppColors.inkSoft)),
              const SizedBox(height: 16),
              FilledButton.icon(onPressed: _newTransfer, icon: const Icon(Icons.add), label: const Text('New transfer')),
            ]))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 80),
                itemCount: _transfers.length,
                itemBuilder: (ctx, i) => _TransferCard(transfer: _transfers[i]),
              ),
            ),
      floatingActionButton: _transfers.isNotEmpty
        ? FloatingActionButton.extended(
            onPressed: _newTransfer,
            icon: const Icon(Icons.swap_horiz),
            label: const Text('New transfer'),
          )
        : null,
    );
  }
}

class _TransferCard extends StatelessWidget {
  const _TransferCard({required this.transfer});
  final WarehouseTransfer transfer;

  @override
  Widget build(BuildContext context) {
    final date = transfer.createdAt.length >= 10 ? transfer.createdAt.substring(0, 10) : transfer.createdAt;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(transfer.noteNumber, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const Spacer(),
            Text(date, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: _LocChip(label: transfer.fromLocation ?? '—', icon: Icons.output_outlined)),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Icon(Icons.arrow_forward, size: 16, color: AppColors.inkSoft)),
            Expanded(child: _LocChip(label: transfer.toLocation ?? '—', icon: Icons.input_outlined, reverse: true)),
          ]),
          const SizedBox(height: 8),
          ...transfer.items.map((item) => Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Row(children: [
              const Icon(Icons.inventory_2_outlined, size: 14, color: AppColors.inkSoft),
              const SizedBox(width: 6),
              Text('${item.quantity}×  ', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              Expanded(child: Text(item.name, style: const TextStyle(fontSize: 13))),
            ]),
          )),
          if (transfer.createdByUsername != null) ...[
            const SizedBox(height: 6),
            Text('By: ${transfer.createdByUsername}', style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
          ],
        ]),
      ),
    );
  }
}

class _LocChip extends StatelessWidget {
  const _LocChip({required this.label, required this.icon, this.reverse = false});
  final String label;
  final IconData icon;
  final bool reverse;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.07),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!reverse) ...[Icon(icon, size: 14, color: AppColors.primary), const SizedBox(width: 4)],
          Flexible(child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis)),
          if (reverse) ...[const SizedBox(width: 4), Icon(icon, size: 14, color: AppColors.primary)],
        ],
      ),
    );
  }
}
