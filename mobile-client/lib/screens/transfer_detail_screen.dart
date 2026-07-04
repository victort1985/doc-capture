import 'dart:convert';
import 'dart:typed_data';
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
import '../services/api_service.dart';
import '../services/delivery_notes_service.dart';
import '../services/management_services.dart';

/// Shown immediately after a warehouse transfer is created. Renders as a
/// document identical in style to the regular накладная (same logo, same
/// company header, same table/terms/signature-line layout) — the
/// destination warehouse's name goes in the "שם" field, and a description
/// of the source/destination locations goes in the "הערות" field.
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
  NoteSettings _settings = NoteSettings.empty;

  @override
  void initState() {
    super.initState();
    DeliveryNotesService(context.read<ApiService>()).getSettings().then((s) {
      if (mounted) setState(() => _settings = s);
    });
  }

  Uint8List? _decodeLogoBytes() {
    final logo = _settings.logoBase64;
    if (logo == null) return null;
    try {
      final comma = logo.indexOf(',');
      final data = comma >= 0 ? logo.substring(comma + 1) : logo;
      return base64Decode(data);
    } catch (_) { return null; }
  }

  String get _fromTo => '${widget.fromLocationName} \u2192 ${widget.toLocationName}';

  Future<pw.Document> _buildPdf() async {
    final pdf = pw.Document();

    final fontR = await PdfGoogleFonts.notoSansHebrewRegular();
    final fontB = await PdfGoogleFonts.notoSansHebrewBold();

    final logoBytes = _decodeLogoBytes();
    pw.ImageProvider? logoImg;
    if (logoBytes != null) {
      try { logoImg = pw.MemoryImage(logoBytes); } catch (_) {}
    }

    final companyName = _settings.companyName ?? 'אם.סי. אילת מיוזיק בע"מ';
    final companyAddr = _settings.companyAddress ?? 'נחל חיון 3/3, אילת, מיקוד 8813501';
    final companyPhone = _settings.companyPhone ?? '08-6315342';
    final companyFax = _settings.companyFax ?? '08-6318461';
    final companyMobile = _settings.companyMobile ?? '052-4702008/1';
    final noteNum = '${widget.transfer.id}';
    final documentType = 'העברת ציוד בין מחסנים';

    final termsText = _settings.termsText ??
        '''תנאים:
השוכר מצהיר כי קיבל את הציוד במצב תקין וראוי לעבודה לאחר שבדקו.''';

    pw.Widget t(String text, {pw.Font? font, double size = 9, PdfColor color = PdfColors.black, pw.TextAlign? align}) =>
      pw.Text(text,
        textDirection: pw.TextDirection.rtl,
        textAlign: align,
        style: pw.TextStyle(font: font ?? fontR, fontSize: size, color: color));

    pw.Widget fieldRow(String label, String value, {int flex = 1}) =>
      pw.Expanded(flex: flex, child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
        pw.Expanded(child: pw.Container(
          decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(width: 0.5))),
          padding: const pw.EdgeInsets.only(bottom: 2),
          child: t(value, size: 10),
        )),
        pw.SizedBox(width: 4),
        t('$label:', font: fontB, size: 9),
      ]));

    pw.Widget cell(String text, {bool bold = false, pw.TextAlign? align}) =>
      pw.Padding(
        padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: t(text, font: bold ? fontB : fontR, size: 9, align: align));

    final filledRows = widget.items.length;
    final emptyCount = (12 - filledRows).clamp(0, 12);

    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(20, 20, 20, 20),
      header: (ctx) => pw.Container(
        padding: const pw.EdgeInsets.only(bottom: 6),
        decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(width: 0.5, color: PdfColors.grey400))),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            if (logoImg != null)
              pw.Image(logoImg, height: 40, fit: pw.BoxFit.contain),
            t(companyName, font: fontB, size: 12),
            t(companyAddr, size: 8, color: PdfColors.grey700),
            t('טל: $companyPhone | פקס: $companyFax | נייד: $companyMobile', size: 7, color: PdfColors.grey700),
          ])),
          pw.SizedBox(width: 12),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Container(
              padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: pw.BoxDecoration(border: pw.Border.all(width: 1.5), borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6))),
              child: t(documentType, font: fontB, size: 16),
            ),
            pw.SizedBox(height: 4),
            pw.Row(children: [
              t(noteNum, font: fontB, size: 18),
              pw.SizedBox(width: 6),
              t('מס׳', font: fontB, size: 11),
            ]),
          ]),
        ]),
      ),
      build: (ctx) => [
        pw.SizedBox(height: 8),

        // Date + Name (destination warehouse)
        pw.Row(children: [
          fieldRow('תאריך', widget.transfer.createdAt.split('T').first),
          pw.SizedBox(width: 12),
          fieldRow('שם', widget.toLocationName, flex: 3),
        ]),
        pw.SizedBox(height: 8),

        // Equipment table
        pw.Table(
          border: pw.TableBorder.all(width: 0.5, color: PdfColors.grey600),
          columnWidths: {
            0: const pw.FixedColumnWidth(40),
            1: const pw.FlexColumnWidth(4),
            2: const pw.FlexColumnWidth(2),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColors.grey200),
              children: [
                cell('כמות', bold: true),
                cell('שמות הפריטים', bold: true),
                cell('הערות', bold: true),
              ],
            ),
            ...widget.items.map((it) => pw.TableRow(children: [
              cell('${it['quantity'] ?? 1}'),
              cell('${it['name']}'),
              cell('${it['barcode'] ?? ''}'),
            ])),
            ...List.generate(emptyCount, (_) => pw.TableRow(
              children: [pw.SizedBox(height: 16), pw.SizedBox(height: 16), pw.SizedBox(height: 16)],
            )),
          ],
        ),

        // Remarks — where the transfer is from/to
        pw.SizedBox(height: 8),
        pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
          pw.Expanded(child: t(_fromTo, size: 9)),
          pw.SizedBox(width: 4),
          t('הערות:', font: fontB, size: 9),
        ]),
        if (widget.transfer.notes?.isNotEmpty == true) ...[
          pw.SizedBox(height: 4),
          t(widget.transfer.notes!, size: 9, color: PdfColors.grey700),
        ],

        pw.SizedBox(height: 16),

        pw.Container(
          padding: const pw.EdgeInsets.all(8),
          decoration: pw.BoxDecoration(border: pw.Border.all(width: 0.5, color: PdfColors.grey400)),
          child: t(termsText, size: 7, color: PdfColors.grey800),
        ),

        pw.SizedBox(height: 24),

        // Signature line (blank — internal document, no client signature)
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
            pw.Container(width: 130, height: 0.5, color: PdfColors.black),
            pw.SizedBox(height: 4),
            t('בוצע ע"י', font: fontR, size: 9),
            t(widget.createdByName, font: fontB, size: 9),
          ]),
        ]),
      ],
    ));
    return pdf;
  }

  Future<void> _print() async {
    setState(() => _busy = true);
    try {
      final pdf = await _buildPdf();
      final bytes = await pdf.save();
      await Printing.layoutPdf(onLayout: (_) => bytes);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share() async {
    setState(() => _busy = true);
    try {
      final pdf = await _buildPdf();
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
          IconButton(icon: const Icon(Icons.print_outlined), onPressed: _busy ? null : _print),
          IconButton(icon: const Icon(Icons.ios_share), onPressed: _busy ? null : _share),
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
                      Text(l10n.transferTo, style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
                      Text(widget.toLocationName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 10),
                      Text(_fromTo, style: const TextStyle(color: AppColors.inkSoft)),
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
                      Text(widget.createdByName, style: const TextStyle(color: AppColors.inkSoft, fontSize: 12)),
                    ]),
                  ),
                ),
              ],
            ),
    );
  }
}
