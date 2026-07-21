import 'package:flutter/material.dart';
import '../app/theme.dart';

class PreviewLineItem {
  final String description;
  final num quantity;
  const PreviewLineItem(this.description, this.quantity);
}

/// A small card showing a document's real content (client, number,
/// first couple of line items, total) rather than a generic file
/// icon — tapping it fetches and opens the actual PDF via the
/// onTap callback.
class DocumentPreviewCard extends StatelessWidget {
  const DocumentPreviewCard({
    super.key,
    required this.docNumber,
    required this.clientName,
    required this.total,
    required this.items,
    this.onTap,
    this.loading = false,
  });

  final String docNumber;
  final String clientName;
  final double total;
  final List<PreviewLineItem> items;
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final shown = items.take(2).toList();
    final more = items.length - shown.length;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 88,
          height: 112,
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.border),
          ),
          child: loading
              ? const Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(docNumber, style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w700, color: AppColors.primary), maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Container(height: 1, color: AppColors.border),
                    const SizedBox(height: 4),
                    Text(clientName, style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    for (final it in shown)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 1),
                        child: Text('${it.description} ×${it.quantity}', style: const TextStyle(fontSize: 6.5, color: AppColors.inkSoft), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    if (more > 0) Text('+$more', style: const TextStyle(fontSize: 6, color: AppColors.inkSoft)),
                    const Spacer(),
                    Text('₪${total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.primary)),
                  ],
                ),
        ),
      ),
    );
  }
}
