import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/management_services.dart';

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
    final role = context.read<AppState>().currentUser?.role ?? 'user';
    final isPrivileged = role == 'admin' || role == 'global';

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
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 18),
                  const SizedBox(width: 6),
                  Text(l10n.fleetRemindersTitle, style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.orange)),
                ]),
                const SizedBox(height: 6),
                ..._reminders.map((r) {
                  final v = r['vehicle'] as Map<String, dynamic>;
                  final type = r['type'] == 'inspection' ? l10n.fleetInspection : l10n.fleetTest;
                  return Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('• ${v['make']} ${v['model']} (${v['licensePlate']}) — $type: ${r['dueDate'] ?? ''}'),
                  );
                }),
              ]),
            ),
          ),

        SliverList(
          delegate: SliverChildBuilderDelegate(
            (ctx, i) => _VehicleTile(
              vehicle: _vehicles[i], svc: _svc,
              isPrivileged: isPrivileged, onRefresh: _load,
            ),
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

// ── Vehicle tile ──────────────────────────────────────────────────────────────

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({required this.vehicle, required this.svc, required this.isPrivileged, required this.onRefresh});
  final Vehicle vehicle;
  final FleetService svc;
  final bool isPrivileged;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: vehicle.isActive ? AppColors.primary.withOpacity(0.15) : Colors.grey.shade200,
          child: Icon(Icons.directions_car, size: 20, color: vehicle.isActive ? AppColors.primary : Colors.grey),
        ),
        title: Text('${vehicle.make} ${vehicle.model}${vehicle.year != null ? ' (${vehicle.year})' : ''}',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(vehicle.licensePlate, style: const TextStyle(fontFamily: 'Courier', fontWeight: FontWeight.w700)),
          Row(children: [
            if (vehicle.currentMileage > 0) ...[
              const Icon(Icons.speed, size: 12, color: AppColors.inkSoft),
              const SizedBox(width: 3),
              Text('${vehicle.currentMileage.toLocaleString()} km', style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
              const SizedBox(width: 8),
            ],
            if (vehicle.assignedUserName != null) ...[
              const Icon(Icons.person_outline, size: 12, color: AppColors.inkSoft),
              const SizedBox(width: 3),
              Text(vehicle.assignedUserName!, style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
            ],
          ]),
        ]),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(
            icon: const Icon(Icons.local_gas_station_outlined, size: 20),
            tooltip: l10n.fleetAddRefuel,
            onPressed: () => _showRefuelDialog(context, l10n),
          ),
          const Icon(Icons.chevron_right, size: 18),
        ]),
        onTap: () => _showVehicleDetail(context, l10n),
      ),
    );
  }

  void _showVehicleDetail(BuildContext context, AppLocalizations l10n) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _VehicleDetailSheet(
        vehicle: vehicle, svc: svc, isPrivileged: isPrivileged, onRefresh: onRefresh,
      ),
    );
  }

  void _showRefuelDialog(BuildContext context, AppLocalizations l10n) async {
    final litersCtrl = TextEditingController();
    final costCtrl = TextEditingController();
    final odomCtrl = TextEditingController(text: vehicle.currentMileage > 0 ? '${vehicle.currentMileage}' : '');
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
              final odometer = int.tryParse(odomCtrl.text);
              await svc.addRefuel(vehicle.id, {
                'date': DateTime.now().toIso8601String().substring(0, 10),
                'liters': liters,
                if (costCtrl.text.isNotEmpty) 'cost': double.tryParse(costCtrl.text),
                if (odometer != null) 'odometer': odometer,
                if (stationCtrl.text.isNotEmpty) 'station': stationCtrl.text,
              });
              // Update mileage if odometer was entered
              if (odometer != null && odometer > vehicle.currentMileage) {
                await svc.updateMileage(vehicle.id, odometer);
              }
              if (context.mounted) Navigator.pop(context);
              onRefresh();
            },
            child: Text(l10n.calendarSave),
          ),
        ],
      ),
    );
  }
}

// ── Vehicle detail bottom sheet ───────────────────────────────────────────────

class _VehicleDetailSheet extends StatefulWidget {
  const _VehicleDetailSheet({required this.vehicle, required this.svc, required this.isPrivileged, required this.onRefresh});
  final Vehicle vehicle;
  final FleetService svc;
  final bool isPrivileged;
  final VoidCallback onRefresh;
  @override
  State<_VehicleDetailSheet> createState() => _VehicleDetailSheetState();
}

class _VehicleDetailSheetState extends State<_VehicleDetailSheet> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<FuelRefuel> _refuels = [];
  List<VehicleDocument> _docs = [];
  bool _loadingRefuels = true;
  bool _loadingDocs = true;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _loadRefuels();
    _loadDocs();
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _loadRefuels() async {
    final r = await widget.svc.listRefuels(widget.vehicle.id);
    if (mounted) setState(() { _refuels = r; _loadingRefuels = false; });
  }

  Future<void> _loadDocs() async {
    final d = await widget.svc.listDocuments(widget.vehicle.id);
    if (mounted) setState(() { _docs = d; _loadingDocs = false; });
  }

  Future<void> _uploadDoc() async {
    final l10n = AppLocalizations.of(context)!;
    final descCtrl = TextEditingController();
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add document'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description (optional)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.cancel)),
          FilledButton.icon(
            icon: const Icon(Icons.camera_alt_outlined, size: 16),
            label: const Text('Camera'),
            onPressed: () async {
              Navigator.pop(ctx);
              final img = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
              if (img == null) return;
              await widget.svc.uploadDocument(widget.vehicle.id, img.path, img.name, 'image/jpeg', description: descCtrl.text.isNotEmpty ? descCtrl.text : null);
              _loadDocs(); widget.onRefresh();
            },
          ),
          FilledButton.icon(
            icon: const Icon(Icons.attach_file, size: 16),
            label: const Text('File'),
            onPressed: () async {
              Navigator.pop(ctx);
              final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
              if (file == null) return;
              await widget.svc.uploadDocument(widget.vehicle.id, file.path, file.name, 'image/jpeg', description: descCtrl.text.isNotEmpty ? descCtrl.text : null);
              _loadDocs(); widget.onRefresh();
            },
          ),
        ],
      ),
    );
  }

  void _viewDoc(VehicleDocument doc) async {
    final bytes = await widget.svc.downloadDocument(doc.id);
    if (!mounted) return;
    showDialog(
      context: context,
      builder: (_) => Dialog(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          AppBar(title: Text(doc.originalName), automaticallyImplyLeading: false, actions: [
            IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
          ]),
          if (doc.isImage)
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 500),
              child: Image.memory(bytes, fit: BoxFit.contain),
            )
          else
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(children: [
                const Icon(Icons.picture_as_pdf_outlined, size: 64, color: AppColors.stamp),
                const SizedBox(height: 8),
                Text(doc.originalName, textAlign: TextAlign.center),
              ]),
            ),
        ]),
      ),
    );
  }

  Future<void> _updateMileage() async {
    final l10n = AppLocalizations.of(context)!;
    final ctrl = TextEditingController(text: '${widget.vehicle.currentMileage}');
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(l10n.fleetOdometer),
        content: TextField(controller: ctrl, keyboardType: TextInputType.number, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () async {
              final v = int.tryParse(ctrl.text);
              if (v != null) await widget.svc.updateMileage(widget.vehicle.id, v);
              if (context.mounted) Navigator.pop(context);
              widget.onRefresh();
            },
            child: Text(l10n.calendarSave),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final v = widget.vehicle;
    return DraggableScrollableSheet(
      initialChildSize: 0.75, maxChildSize: 0.95, minChildSize: 0.4,
      expand: false,
      builder: (_, ctrl) => Column(children: [
        const SizedBox(height: 8),
        Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 12),

        // Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${v.make} ${v.model}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
              Text(v.licensePlate, style: const TextStyle(fontFamily: 'Courier', fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.primary)),
              if (v.assignedUserName != null)
                Text(v.assignedUserName!, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
            ])),
            // Mileage — tappable to update
            GestureDetector(
              onTap: _updateMileage,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text('${v.currentMileage.toLocaleString()} km',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.primary)),
                  const Text('tap to update', style: TextStyle(fontSize: 9, color: AppColors.inkSoft)),
                ]),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 12),

        // Info row
        if (v.lastInspectionDate != null || v.lastTestDate != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              if (v.lastInspectionDate != null) ...[
                const Icon(Icons.verified_outlined, size: 14, color: AppColors.inkSoft),
                const SizedBox(width: 4),
                Text('${l10n.fleetInspection}: ${v.lastInspectionDate}', style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
                const SizedBox(width: 12),
              ],
              if (v.lastTestDate != null) ...[
                const Icon(Icons.assignment_turned_in_outlined, size: 14, color: AppColors.inkSoft),
                const SizedBox(width: 4),
                Text('${l10n.fleetTest}: ${v.lastTestDate}', style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
              ],
            ]),
          ),

        const SizedBox(height: 8),
        TabBar(controller: _tabs, tabs: [
          Tab(text: l10n.fleetRefuelHistory),
          Tab(text: 'Documents'),
        ]),
        const Divider(height: 1),

        Expanded(
          child: TabBarView(controller: _tabs, children: [
            // Refuels
            _loadingRefuels
                ? const Center(child: CircularProgressIndicator())
                : _refuels.isEmpty
                    ? Center(child: Text(l10n.fleetNoRefuels, style: const TextStyle(color: AppColors.inkSoft)))
                    : ListView.separated(
                        controller: ctrl,
                        padding: const EdgeInsets.all(8),
                        itemCount: _refuels.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final r = _refuels[i];
                          return ListTile(
                            dense: true,
                            leading: const Icon(Icons.local_gas_station_outlined, size: 18),
                            title: Text('${r.liters.toStringAsFixed(1)} L${r.cost != null ? ' · ₪${r.cost!.toStringAsFixed(0)}' : ''}'),
                            subtitle: Text('${r.date}${r.odometer != null ? ' · ${r.odometer} km' : ''}${r.station != null ? ' · ${r.station}' : ''}', style: const TextStyle(fontSize: 11)),
                          );
                        },
                      ),

            // Documents
            Column(children: [
              if (widget.isPrivileged)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: OutlinedButton.icon(
                    onPressed: _uploadDoc,
                    icon: const Icon(Icons.upload_file_outlined, size: 16),
                    label: const Text('Add document'),
                  ),
                ),
              Expanded(
                child: _loadingDocs
                    ? const Center(child: CircularProgressIndicator())
                    : _docs.isEmpty
                        ? const Center(child: Text('No documents', style: TextStyle(color: AppColors.inkSoft)))
                        : GridView.builder(
                            controller: ctrl,
                            padding: const EdgeInsets.all(8),
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 6, mainAxisSpacing: 6),
                            itemCount: _docs.length,
                            itemBuilder: (_, i) {
                              final doc = _docs[i];
                              return GestureDetector(
                                onTap: () => _viewDoc(doc),
                                child: Stack(children: [
                                  Container(
                                    decoration: BoxDecoration(
                                      color: Colors.grey.shade100,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(color: Colors.grey.shade300),
                                    ),
                                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                                      Icon(doc.isImage ? Icons.image_outlined : Icons.description_outlined, size: 32, color: AppColors.primary),
                                      const SizedBox(height: 4),
                                      Padding(
                                        padding: const EdgeInsets.symmetric(horizontal: 4),
                                        child: Text(doc.description ?? doc.originalName, maxLines: 2, overflow: TextOverflow.ellipsis,
                                          textAlign: TextAlign.center, style: const TextStyle(fontSize: 10)),
                                      ),
                                    ]),
                                  ),
                                  if (widget.isPrivileged)
                                    Positioned(top: 2, right: 2,
                                      child: GestureDetector(
                                        onTap: () async {
                                          await widget.svc.deleteDocument(doc.id);
                                          _loadDocs();
                                        },
                                        child: Container(
                                          padding: const EdgeInsets.all(2),
                                          decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                                          child: const Icon(Icons.close, size: 10, color: Colors.white),
                                        ),
                                      ),
                                    ),
                                ]),
                              );
                            },
                          ),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }
}

extension _IntFormat on int {
  String toLocaleString() {
    final s = toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return buf.toString();
  }
}
