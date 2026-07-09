import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/delivery_notes_service.dart';
import 'delivery_note_form_screen.dart';

class DeliveryNotesScreen extends StatefulWidget {
  const DeliveryNotesScreen({super.key});
  @override
  State<DeliveryNotesScreen> createState() => _DeliveryNotesScreenState();
}

class _DeliveryNotesScreenState extends State<DeliveryNotesScreen> {
  late final DeliveryNotesService _svc;
  List<DeliveryNote> _notes = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _svc = DeliveryNotesService(context.read<ApiService>());
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final notes = await _svc.list();
      if (mounted) setState(() { _notes = notes; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Color _statusColor(DeliveryNoteStatus s) => switch (s) {
    DeliveryNoteStatus.signed => Colors.green,
    DeliveryNoteStatus.cancelled => Colors.red,
    _ => Colors.orange,
  };

  String _statusLabel(BuildContext context, DeliveryNoteStatus s) {
    final l10n = AppLocalizations.of(context)!;
    return switch (s) {
      DeliveryNoteStatus.signed => l10n.dnStatusSigned,
      DeliveryNoteStatus.cancelled => l10n.dnStatusCancelled,
      _ => l10n.dnStatusDraft,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(AppLocalizations.of(context)?.deliveryNotesTitle ?? 'Delivery Notes'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () async {
              await Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => DeliveryNoteFormScreen(svc: _svc),
              ));
              _load();
            },
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _notes.isEmpty
                ? Center(child: Text(AppLocalizations.of(context)!.dnNoNotesYet, style: const TextStyle(color: AppColors.inkSoft)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _notes.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final n = _notes[i];
                        return Card(
                          child: ListTile(
                            onTap: () async {
                              await Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) => DeliveryNoteFormScreen(svc: _svc, noteId: n.id),
                              ));
                              _load();
                            },
                            leading: CircleAvatar(
                              backgroundColor: _statusColor(n.status).withOpacity(0.15),
                              child: Icon(Icons.description_outlined, color: _statusColor(n.status), size: 20),
                            ),
                            title: Text(n.clientName ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              if (n.noteNumber != null) Text('№ ${n.noteNumber}  ·  ${n.date ?? ''}', style: const TextStyle(fontSize: 12)),
                              if (n.deliveredTo != null) Text(n.deliveredTo!, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
                            ]),
                            trailing: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: _statusColor(n.status).withOpacity(0.12),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(_statusLabel(context, n.status),
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _statusColor(n.status))),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
      ),
    );
  }
}
