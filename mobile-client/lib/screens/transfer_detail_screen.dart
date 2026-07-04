import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'dart:io';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/management_services.dart';
import '../store/app_state.dart';

class TransferDetailScreen extends StatefulWidget {
  const TransferDetailScreen({
    super.key,
    required this.transfer,
    required this.fromLocationName,
    required this.toLocationName,
    required this.items, // [{name, barcode, quantity}]
    required this.createdByName,
  });

  final WarehouseTransfer transfer;
  final String fromLocationName;
  final String toLocationName;
  final List<Map<String, dynamic>> items;
  final String createdByName;

  @override
  State<TransferDetailScreen> createState() => _TransferDetailScreenState();
}

class _TransferDetailScreenState extends State<TransferDetailScreen> {
  bool _busy = false;

  Future<pw.Document> _buildPdf(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;
    final langCode = context.read<AppState>().languageCode;
    final isHebrew = langCode == 'he';
    final font = isHebrew ? await PdfGoogleFonts.notoSansHebrewRegular() : await PdfGoogleFonts.notoSansRegular();
    final fontB = isHebrew ? await PdfGoogleFonts.notoSansHebrewBold() : await PdfGoogleFonts.notoSansBold();
    final dir = isHebrew ? pw.TextDirection.rtl : pw.TextDirection.ltr;

    pw.Widget t(String text, {pw.Font? f, double size = 10, PdfColor color = PdfColors.black, FontWeight? weight}) =>
        pw.Text(text, style: pw.TextStyle(font: f ?? font, fontSize: size, color: color), textDirection: dir);

    final pdf = pw.Document();
    pdf.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (ctx) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Text(l10n.transferTitle, style: pw.TextStyle(font: fontB, fontSize: 18), textDirection: dir),
        pw.SizedBox(height: 4),
        t('№ ${widget.transfer.id}   ·   ${widget.transfer.createdAt.split('T').first}', color: PdfColors.grey700, size: 10),
        pw.Divider(height: 20),

        pw.Row(children: [
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            t(l10n.transferFrom, f: fontB, size: 9, color: PdfColors.grey600),
            t(widget.fromLocationName, size: 13),
          ])),
          pw.SizedBox(width: 12),
          t('->', size: 16, color: PdfColors.grey600),
          pw.SizedBox(width: 12),
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            t(l10n.transferTo, f: fontB, size: 9, color: PdfColors.grey600),
            t(widget.toLocationName, size: 13),
          ])),
        ]),
        pw.SizedBox(height: 18),

        t(l10n.transferEquipment, f: fontB, size: 12),
        pw.SizedBox(height: 6),
        pw.Table(
          border: pw.TableBorder.all(width: 0.5, color: PdfColors.grey400),
          columnWidths: const {0: pw.FlexColumnWidth(3), 1: pw.FlexColumnWidth(2), 2: pw.FlexColumnWidth(1)},
          children: [
            pw.TableRow(decoration: const pw.BoxDecoration(color: PdfColors.grey200), children: [
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: t(l10n.transferEquipment, f: fontB, size: 9)),
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: t('Barcode', f: fontB, size: 9)),
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: t('Qty', f: fontB, size: 9)),
            ]),
            ...widget.items.map((it) => pw.TableRow(children: [
                  pw.Padding(padding: const pw.EdgeInsets.all(6), child: t('${it['name']}')),
                  pw.Padding(padding: const pw.EdgeInsets.all(6), child: t('${it['barcode']}', size: 9, color: PdfColors.grey700)),
                  pw.Padding(padding: const pw.EdgeInsets.all(6), child: t('${it['quantity']}')),
                ])),
          ],
        ),

        if (widget.transfer.notes?.isNotEmpty == true) ...[
          pw.SizedBox(height: 18),
          t(l10n.transferNotes, f: fontB, size: 11),
          pw.SizedBox(height: 4),
          t(widget.transfer.notes!, size: 10),
        ],

        pw.SizedBox(height: 40),
        pw.Divider(),
        pw.SizedBox(height: 6),
        t('${l10n.transferSubmit}: ${widget.createdByName}', size: 10, color: PdfColors.grey700),
      ]),
    ));
    return pdf;
  }

  Future<void> _print(BuildContext context) async {
    setState(() => _busy = true);
    try {
      final pdf = await _buildPdf(context);
      final bytes = await pdf.save();
      await Printing.layoutPdf(onLayout: (_) => bytes);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share(BuildContext context) async {
    setState(() => _busy = true);
    try {
      final pdf = await _buildPdf(context);
      final bytes = await pdf.save();
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/transfer_${widget.transfer.id}.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles([XFile(file.path, mimeType: 'application/pdf')]);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text('${l10n.transferTitle}  №${widget.transfer.id}'),
        actions: [
          IconButton(icon: const Icon(Icons.print_outlined), onPressed: _busy ? null : () => _print(context)),
          IconButton(icon: const Icon(Icons.ios_share), onPressed: _busy ? null : () => _share(context)),
        ],
      ),
      body: _busy
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('№ ${widget.transfer.id}   ·   ${widget.transfer.createdAt.split('T').first}', style: const TextStyle(color: AppColors.inkSoft)),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: _LocBlock(label: l10n.transferFrom, name: widget.fromLocationName)),
                        const Icon(Icons.arrow_forward, color: AppColors.inkSoft),
                        Expanded(child: _LocBlock(label: l10n.transferTo, name: widget.toLocationName)),
                      ]),
                      const Divider(height: 28),
                      Text(l10n.transferEquipment, style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      ...widget.items.map((it) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(children: [
                          Expanded(child: Text('${it['name']}')),
                          Text('${it['quantity']}', style: const TextStyle(color: AppColors.inkSoft)),
                        ]),
                      )),
                      if (widget.transfer.notes?.isNotEmpty == true) ...[
                        const Divider(height: 28),
                        Text(l10n.transferNotes, style: const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text(widget.transfer.notes!),
                      ],
                      const Divider(height: 28),
                      Text('${widget.createdByName}', style: const TextStyle(color: AppColors.inkSoft, fontSize: 12)),
                    ]),
                  ),
                ),
              ],
            ),
    );
  }
}

class _LocBlock extends StatelessWidget {
  const _LocBlock({required this.label, required this.name});
  final String label;
  final String name;
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(label, style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
    Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
  ]);
}
