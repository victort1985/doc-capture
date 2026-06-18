import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';

/// Optional per spec section 4.1 — recent uploads list (GET /api/files,
/// scoped to the current user). Kept read-only for the skeleton.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<dynamic>? _items;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<ApiService>();
    final result = await api.get('/files');
    if (mounted) setState(() => _items = result as List<dynamic>);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (_items == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_items!.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inventory_2_outlined, size: 40, color: AppColors.border),
            const SizedBox(height: 12),
            Text(l10n.historyEmpty, style: const TextStyle(color: AppColors.inkSoft)),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: _items!.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 18, endIndent: 18),
      itemBuilder: (context, i) {
        final item = _items![i] as Map<String, dynamic>;
        final isDoc = item['type'] == 'document';
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: AppColors.primaryWash,
            child: Icon(isDoc ? Icons.description_outlined : Icons.image_outlined, color: AppColors.primary, size: 19),
          ),
          title: Text(item['generatedName'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w500)),
          subtitle: Text(item['place'] as String? ?? '', style: const TextStyle(color: AppColors.inkSoft)),
        );
      },
    );
  }
}
