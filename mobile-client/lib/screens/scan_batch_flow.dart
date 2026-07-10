import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/scan_session_service.dart';
import 'scan_review_screen.dart';

/// Runs the full "scan a document" flow, one or many pages: each already-
/// captured photo (from CameraScreen's multi-shot capture, or a single
/// photo from the gallery) gets reviewed and adjusted (crop/filter) in
/// turn, then — once every page has had its turn — an optional custom
/// name can be given before all reviewed pages are combined into one
/// document and committed to storage.
///
/// If reviewing a particular page is cancelled, that page is simply
/// skipped (its buffered session is discarded server-side) and the rest
/// still get their turn. Returns the finalized upload result map, or
/// null if no page ever made it through review.
Future<Map<String, dynamic>?> runScanBatchFlow(
  BuildContext context, {
  required List<File> photos,
  required String place,
  required String docType,
}) async {
  if (photos.isEmpty) return null;
  final pages = <ScanPageResult>[];

  for (int i = 0; i < photos.length; i++) {
    if (!context.mounted) break;
    final result = await Navigator.of(context).push<ScanPageResult>(
      MaterialPageRoute(
        builder: (_) => ScanReviewScreen(
          imageFile: photos[i],
          place: place,
          docType: docType,
          mode: ScanReviewMode.collectForBatch,
          pageLabel: photos.length > 1 ? '${i + 1}/${photos.length}' : null,
        ),
      ),
    );
    if (result != null) pages.add(result);
  }

  if (pages.isEmpty || !context.mounted) return null;

  final customName = await _askDocumentName(context);
  if (!context.mounted) return null;

  try {
    final scanService = context.read<ScanSessionService>();
    return await scanService.combine(pages: pages, place: place, docType: docType, customName: customName);
  } catch (e) {
    debugPrint('[scan_batch_flow] combine failed: $e');
    if (context.mounted) {
      final l10n = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.scanCombineError), duration: const Duration(seconds: 5)),
      );
    }
    return null;
  }
}

Future<String?> _askDocumentName(BuildContext context) async {
  final l10n = AppLocalizations.of(context)!;
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(l10n.scanDocumentNameTitle),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: InputDecoration(hintText: l10n.scanDocumentNameHint),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(null),
          child: Text(l10n.scanSkipNaming),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext)
              .pop(controller.text.trim().isEmpty ? null : controller.text.trim()),
          child: Text(l10n.scanSaveDocument),
        ),
      ],
    ),
  );
}
