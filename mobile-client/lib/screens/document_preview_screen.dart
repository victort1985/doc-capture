import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import '../l10n/app_localizations.dart';

/// Shown right after uploading a document (not a photo — photos skip
/// this entirely) so the user can check the auto-cropped/enhanced
/// result before leaving the screen, and share/print it straight away
/// if they want to.
class DocumentPreviewScreen extends StatelessWidget {
  const DocumentPreviewScreen({super.key, required this.pdfBytes, required this.filename});

  final Uint8List pdfBytes;
  final String filename;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.documentPreviewTitle)),
      body: PdfPreview(
        build: (format) async => pdfBytes,
        pdfFileName: filename,
        canDebug: false,
        allowPrinting: true,
        allowSharing: true,
        useActions: true,
      ),
    );
  }
}
