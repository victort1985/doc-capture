import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/returns_service.dart';
import 'return_form_screen.dart';

class ReturnsScreen extends StatefulWidget {
  const ReturnsScreen({super.key});
  @override
  State<ReturnsScreen> createState() => ReturnsScreenState();
}

class ReturnsScreenState extends State<ReturnsScreen> {
  late final ReturnsService _svc;
  List<ReturnNote> _notes = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _svc = ReturnsService(context.read<ApiService>());
    _load();
  }

  Future<void> refresh() => _load();

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final notes = await _svc.list();
      if (mounted) setState(() { _notes = notes; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(l10n.returnsTitle),
        backgroundColor: Colors.transparent,
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final created = await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ReturnFormScreen()));
          if (created == true) _load();
        },
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _notes.isEmpty
                ? Center(child: Text(l10n.returnsNoneYet, style: const TextStyle(color: AppColors.inkSoft)))
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
                            leading: const CircleAvatar(
                              backgroundColor: AppColors.primaryWash,
                              child: Icon(Icons.assignment_return_outlined, color: AppColors.primary, size: 20),
                            ),
                            title: Text(n.clientName, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              if (n.returnNumber != null) Text('№ ${n.returnNumber}  ·  ${n.date ?? ''}', style: const TextStyle(fontSize: 12)),
                              Text(n.reason, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft), maxLines: 2, overflow: TextOverflow.ellipsis),
                            ]),
                            trailing: Text('${n.items.length}', style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
                          ),
                        );
                      },
                    ),
                  ),
      ),
    );
  }
}
