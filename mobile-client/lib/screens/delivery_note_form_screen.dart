import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import 'dart:io';
import '../app/theme.dart';
import '../services/delivery_notes_service.dart';
import '../services/pdf_helpers.dart';
import '../services/field_cache_service.dart';
import '../widgets/phone_book_search_field.dart';
import '../widgets/client_search_field.dart';
import '../widgets/item_row_widget.dart';

class DeliveryNoteFormScreen extends StatefulWidget {
  const DeliveryNoteFormScreen({super.key, required this.svc, this.noteId});
  final DeliveryNotesService svc;
  final int? noteId;

  @override
  State<DeliveryNoteFormScreen> createState() => _DeliveryNoteFormScreenState();
}

class _DeliveryNoteFormScreenState extends State<DeliveryNoteFormScreen> {
  DeliveryNote? _note;
  NoteSettings _settings = NoteSettings.empty;
  bool _loading = true;
  bool _saving = false;

  // Form controllers
  final _clientNameCtrl  = TextEditingController();
  final _clientAddrCtrl  = TextEditingController();
  final _clientPhoneCtrl = TextEditingController();
  final _deliveredToCtrl = TextEditingController();
  final _roleCtrl        = TextEditingController();
  final _idNumCtrl       = TextEditingController();
  String _documentType   = 'תעודת משלוח';
  bool   _sendingLink    = false;
  final _dateCtrl        = TextEditingController();
  final _remarksCtrl     = TextEditingController();
  final _lesseeIdCtrl    = TextEditingController();

  // Equipment rows
  List<ItemRow> _items = [ItemRow()];

  // Signatures (base64 PNG)
  String? _lessorSig;
  String? _lesseeSig;

  // Autocomplete suggestions

  @override
  void initState() {
    super.initState();
    if (widget.noteId != null) {
      _loadExisting();
    } else {
      _dateCtrl.text = DateTime.now().toIso8601String().slice(0, 10);      _loadSettings();
    }
  }

  static const _docTypes = [
    'תעודת משלוח',
    'הסכם שכירות',
    'ביצוע עבודה',
    'תעודת משלוח / הסכם שכירות',
    'תעודת משלוח / ביצוע עבודה',
  ];

  Future<void> _sendSigningLink() async {
    if (_note == null) {
      await _save();
      if (_note == null) return;
    }
    setState(() => _sendingLink = true);
    try {
      final api = context.read<ApiService>();
      final data = await api.post('/delivery-notes/${_note!.id}/signing-link', {}) as Map<String, dynamic>;
      final url = data['url'] as String? ?? '';
      final noteNum = _note?.noteNumber ?? '';
      final shareText = 'לחתימה על תעודה מס׳ $noteNum:\n$url';

      if (!mounted) return;

      // On iOS, Share popover requires the source button's position.
      // Get it from the AppBar's share icon via its GlobalKey,
      // or fall back to screen centre if unavailable.
      final box = context.findRenderObject() as RenderBox?;
      final rect = box != null
          ? box.localToGlobal(Offset.zero) & box.size
          : const Rect.fromLTWH(0, 0, 100, 100);

      await Share.share(
        shareText,
        subject: 'תעודה מספר $noteNum לחתימה',
        sharePositionOrigin: rect,
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _sendingLink = false);
    }
  }


  /// Converts ISO date 2026-06-26 → DD/MM/YYYY (26/06/2026)
  String _fmtDate(String iso) {
    if (iso.length == 10 && iso.contains('-')) {
      final p = iso.split('-');
      if (p.length == 3) return '${p[2]}/${p[1]}/${p[0]}';
    }
    return iso;
  }

  Future<void> _loadSettings() async {    final s = await widget.svc.getSettings();
    if (mounted) setState(() { _settings = s; _loading = false; });
  }

  Future<void> _loadExisting() async {
    try {
      final note = await widget.svc.getOne(widget.noteId!);
      final settings = await widget.svc.getSettings();
      _fillFrom(note);
      if (mounted) setState(() { _note = note; _settings = settings; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _fillFrom(DeliveryNote n) {
    _clientNameCtrl.text  = n.clientName ?? '';
    _clientAddrCtrl.text  = n.clientAddress ?? '';
    _deliveredToCtrl.text = n.deliveredTo ?? '';
    _roleCtrl.text        = n.recipientRole ?? '';
    _idNumCtrl.text       = n.recipientIdNumber ?? '';
    _dateCtrl.text        = n.date ?? '';
    if (n.documentType != null) _documentType = n.documentType!;
    _remarksCtrl.text     = n.remarks ?? '';
    _lesseeIdCtrl.text    = n.lesseeIdNumber ?? '';
    _items = n.items.isNotEmpty
        ? n.items.map((i) => ItemRow(quantity: i.quantity, name: i.name, notes: i.notes ?? '')).toList()
        : [ItemRow()];
    _lessorSig = n.lessorSignature;
    _lesseeSig = n.lesseeSignature;
  }

  /// Decodes the base64 logo from settings (data:image/...;base64,... format)
  Uint8List? _decodeLogoBytes() {
    final logo = _settings.logoBase64;
    if (logo == null) return null;
    try {
      final comma = logo.indexOf(',');
      final data = comma >= 0 ? logo.substring(comma + 1) : logo;
      return base64Decode(data);
    } catch (_) { return null; }
  }



  Map<String, dynamic> _toDto() => {
    'documentType': _documentType,
    'clientName': _clientNameCtrl.text,
    'clientAddress': _clientAddrCtrl.text,
    'deliveredTo': _deliveredToCtrl.text,
    'recipientRole': _roleCtrl.text,
    'recipientIdNumber': _idNumCtrl.text,
    'date': _dateCtrl.text,
    'remarks': _remarksCtrl.text,
    'lesseeIdNumber': _lesseeIdCtrl.text,
    'items': _items.where((r) => r.nameCtrl.text.isNotEmpty).map((r) => {
      'quantity': int.tryParse(r.qtyCtrl.text) ?? 1,
      'name': r.nameCtrl.text,
      'notes': r.notesCtrl.text,
    }).toList(),
    if (_lessorSig != null) 'lessorSignature': _lessorSig,
    if (_lesseeSig != null) 'lesseeSignature': _lesseeSig,
  };

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final dto = _toDto();
      if (_note == null) {
        final created = await widget.svc.create(dto);
        setState(() => _note = created);
      } else {
        final updated = await widget.svc.update(_note!.id, dto);
        setState(() => _note = updated);
      }
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _captureSignature({required bool isLessor}) async {
    final result = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => _SignaturePadScreen(title: isLessor ? 'Lessor signature' : 'Lessee signature')),
    );
    if (result != null) {
      setState(() {
        if (isLessor) _lessorSig = result;
        else _lesseeSig = result;
      });
    }
  }

  Future<void> _generateAndSendPdf() async {
    if (_note == null) {
      await _save();
      if (_note == null) return;
    }
    await _save(); // save signatures first

    final pdf = await _buildPdf();
    final bytes = await pdf.save();

    if (!mounted) return;
    // Show print dialog and upload to server
    await Printing.layoutPdf(onLayout: (_) => bytes);

    // Upload to server
    final b64 = base64Encode(bytes);
    await widget.svc.storePdf(_note!.id, b64);
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('PDF saved to server')));
  }

  /// Share the PDF via email, WhatsApp, etc.
  Future<void> _sharePdf() async {
    if (_note == null) {
      await _save();
      if (_note == null) return;
    }
    await _save();

    final pdf = await _buildPdf();
    final bytes = await pdf.save();

    // Write to temp file
    final dir = await getTemporaryDirectory();
    final noteNum = _note?.noteNumber ?? 'note';
    final file = File('${dir.path}/delivery_note_$noteNum.pdf');
    await file.writeAsBytes(bytes);

    // iOS requires sharePositionOrigin for the popover anchor
    final box = context.findRenderObject() as RenderBox?;
    final rect = box != null
        ? box.localToGlobal(Offset.zero) & box.size
        : const Rect.fromLTWH(0, 0, 100, 100);

    await Share.shareXFiles(
      [XFile(file.path, mimeType: 'application/pdf')],
      subject: 'Delivery Note #$noteNum',
      sharePositionOrigin: rect,
    );
  }

  Future<pw.Document> _buildPdf() async {
    final pdf = pw.Document();

    // ── Fonts ───────────────────────────────────────────────────────────────
    final fontR = await PdfGoogleFonts.notoSansHebrewRegular();
    final fontB = await PdfGoogleFonts.notoSansHebrewBold();
    final fontS = fontR; // small/terms — same as regular

    // ── Logo ────────────────────────────────────────────────────────────────
    final logoBytes = _decodeLogoBytes();
    pw.ImageProvider? logoImg;
    if (logoBytes != null) {
      try { logoImg = pw.MemoryImage(logoBytes); } catch (_) {}
    }

    // ── Signature images ────────────────────────────────────────────────────
    pw.ImageProvider? lessorImg;
    pw.ImageProvider? lesseeImg;
    if (_lessorSig != null) {
      try { lessorImg = pw.MemoryImage(_decodeSig(_lessorSig!)); } catch (_) {}
    }
    if (_lesseeSig != null) {
      try { lesseeImg = pw.MemoryImage(_decodeSig(_lesseeSig!)); } catch (_) {}
    }

    final companyName = _settings.companyName ?? 'אם.סי. אילת מיוזיק בע"מ';
    final companyAddr = _settings.companyAddress ?? 'נחל חיון 3/3, אילת, מיקוד 8813501';
    final companyPhone = _settings.companyPhone ?? '08-6315342';
    final companyFax = _settings.companyFax ?? '08-6318461';
    final companyMobile = _settings.companyMobile ?? '052-4702008/1';
    final noteNum = _note?.noteNumber ?? '';

    // ── Terms text ──────────────────────────────────────────────────────────
    final termsText = _settings.termsText ??
        '''תנאים:
השוכר מצהיר כי קיבל את הציוד במצב תקין וראוי לעבודה לאחר שבדקו.''';

    // Helper: RTL text
    pw.Widget t(String text, {pw.Font? font, double size = 9, PdfColor color = PdfColors.black, pw.TextAlign? align}) =>
      pw.Text(text,
        textDirection: pw.TextDirection.rtl,
        textAlign: align,
        style: pw.TextStyle(font: font ?? fontR, fontSize: size, color: color));

    // Helper: field row (label: underline value) – RTL
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

    // Helper: table cell RTL
    pw.Widget cell(String text, {bool bold = false, pw.TextAlign? align}) =>
      pw.Padding(
        padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: t(text, font: bold ? fontB : fontR, size: 9, align: align));

    // ── Empty table rows ────────────────────────────────────────────────────
    final filledRows = _items.where((r) => r.nameCtrl.text.isNotEmpty).length;
    final emptyCount = (12 - filledRows).clamp(0, 12);

    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(20, 20, 20, 20),
      // ── Page header (every page) ─────────────────────────────────────────
      header: (ctx) => pw.Container(
        padding: const pw.EdgeInsets.only(bottom: 6),
        decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(width: 0.5, color: PdfColors.grey400))),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          // Left: logo + company info
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            if (logoImg != null)
              pw.Image(logoImg, height: 40, fit: pw.BoxFit.contain),
            t(companyName, font: fontB, size: 12),
            t(companyAddr, size: 8, color: PdfColors.grey700),
            t('טל: $companyPhone | פקס: $companyFax | נייד: $companyMobile', size: 7, color: PdfColors.grey700),
          ])),
          pw.SizedBox(width: 12),
          // Right: document title + number
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Container(
              padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: pw.BoxDecoration(border: pw.Border.all(width: 1.5), borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6))),
              child: t(_documentType, font: fontB, size: 16),
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

        // ── Date + Name ─────────────────────────────────────────────────────
        pw.Row(children: [
          fieldRow('תאריך', _fmtDate(_dateCtrl.text)),
          pw.SizedBox(width: 12),
          fieldRow('שם', _clientNameCtrl.text, flex: 3),
        ]),
        pw.SizedBox(height: 8),

        // ── Address + Delivered to ──────────────────────────────────────────
        pw.Row(children: [
          fieldRow('כתובת העסק', _clientAddrCtrl.text, flex: 3),
          pw.SizedBox(width: 12),
          fieldRow('נמסר לידי', _deliveredToCtrl.text, flex: 2),
        ]),
        pw.SizedBox(height: 8),

        // ── Role + ID ────────────────────────────────────────────────────────
        pw.Row(children: [
          fieldRow('תפקיד', _roleCtrl.text),
          pw.SizedBox(width: 12),
          fieldRow('מס׳ ת.ז.', _idNumCtrl.text),
          pw.SizedBox(width: 12),
          fieldRow('מקור', ''),
        ]),
        pw.SizedBox(height: 12),

        // ── Equipment table ─────────────────────────────────────────────────
        pw.Table(
          border: pw.TableBorder.all(width: 0.5, color: PdfColors.grey600),
          columnWidths: {
            0: const pw.FixedColumnWidth(40),
            1: const pw.FlexColumnWidth(4),
            2: const pw.FlexColumnWidth(2),
          },
          children: [
            // Header
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColors.grey200),
              children: [
                cell('כמות', bold: true),
                cell('שמות הפריטים', bold: true),
                cell('הערות', bold: true),
              ],
            ),
            // Filled rows
            ..._items.where((r) => r.nameCtrl.text.isNotEmpty).map((r) => pw.TableRow(children: [
              cell(r.qtyCtrl.text.isEmpty ? '1' : r.qtyCtrl.text),
              cell(r.nameCtrl.text),
              cell(r.notesCtrl.text),
            ])),
            // Empty rows
            ...List.generate(emptyCount, (_) => pw.TableRow(
              children: [
                pw.SizedBox(height: 16),
                pw.SizedBox(height: 16),
                pw.SizedBox(height: 16),
              ],
            )),
          ],
        ),

        // ── Remarks ─────────────────────────────────────────────────────────
        if (_remarksCtrl.text.isNotEmpty) ...[
          pw.SizedBox(height: 8),
          pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Expanded(child: t(_remarksCtrl.text, size: 9)),
            pw.SizedBox(width: 4),
            t('הערות:', font: fontB, size: 9),
          ]),
        ],

        pw.SizedBox(height: 16),

        // ── Terms ────────────────────────────────────────────────────────────
        pw.Container(
          padding: const pw.EdgeInsets.all(8),
          decoration: pw.BoxDecoration(border: pw.Border.all(width: 0.5, color: PdfColors.grey400)),
          child: t(termsText, size: 7, color: PdfColors.grey800),
        ),

        pw.SizedBox(height: 16),

        // ── Signatures ───────────────────────────────────────────────────────
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
          // Lessee (client) signature — left
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
            if (lesseeImg != null)
              pw.Container(height: 50, width: 130, child: pw.Image(lesseeImg, fit: pw.BoxFit.contain)),
            pw.Container(width: 130, height: 0.5, color: PdfColors.black),
            pw.SizedBox(height: 4),
            t('חתימת השוכר', font: fontR, size: 9),
            if (_lesseeIdCtrl.text.isNotEmpty)
              t('מסי ת.ז. ${_lesseeIdCtrl.text}', size: 8, color: PdfColors.grey700),
          ]),
          // Lessor (company) signature — right
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
            if (lessorImg != null)
              pw.Container(height: 50, width: 130, child: pw.Image(lessorImg, fit: pw.BoxFit.contain)),
            pw.Container(width: 130, height: 0.5, color: PdfColors.black),
            pw.SizedBox(height: 4),
            t('חתימת המשכיר', font: fontR, size: 9),
          ]),
        ]),

        // ── Bottom remarks line ─────────────────────────────────────────────
        pw.SizedBox(height: 10),
        pw.Row(children: [
          pw.Expanded(child: pw.Container(height: 0.5, color: PdfColors.grey400)),
          pw.SizedBox(width: 4),
          t('הערות:', font: fontB, size: 9),
        ]),
        pw.SizedBox(height: 4),
        pw.Row(children: [
          pw.Expanded(child: pw.Container(height: 0.5, color: PdfColors.grey400)),
          pw.SizedBox(width: 4),
          t('חתימה:', font: fontB, size: 9),
        ]),
      ],
    ));
    return pdf;
  }


  Widget _field(String label, TextEditingController ctrl, {
    TextInputType? keyboardType,
    String? cacheKey,
    bool required = false,
    int maxLines = 1,
    bool isNameField = false,
    String? contactFilter,
    void Function(PhoneContact)? onContactSelected,
  }) {
    final key = cacheKey ?? label.toLowerCase().replaceAll(' ', '_');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft)),
        const SizedBox(height: 4),
        if (isNameField)
          PhoneBookSearchField(
            fieldKey: 'dn.\$key',
            controller: ctrl,
            label: label,
            contactFilter: contactFilter,
            onContactSelected: onContactSelected,
          )
        else
          _CachedTextField(
            cacheKey: 'dn.\$key',
            controller: ctrl,
            keyboardType: keyboardType,
            maxLines: maxLines,
          ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final isSigned = _note?.status == DeliveryNoteStatus.signed;

    return Scaffold(
      appBar: AppBar(
        title: Text(_note == null ? 'New delivery note' : 'Note № ${_note!.noteNumber ?? ''}'),
        actions: [
          if (!isSigned) TextButton(onPressed: _saving ? null : _save, child: const Text('Save')),
          IconButton(
            icon: const Icon(Icons.picture_as_pdf_outlined),
            onPressed: _generateAndSendPdf,
            tooltip: 'Print / PDF',
          ),
          IconButton(
            icon: const Icon(Icons.share_outlined),
            onPressed: _sharePdf,
            tooltip: 'Share (WhatsApp / Email)',
          ),
          IconButton(
            icon: _sendingLink
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.draw_outlined),
            onPressed: _sendingLink ? null : _sendSigningLink,
            tooltip: 'שלח לחתימה (WhatsApp / SMS)',
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
          children: [
            // Company header (decorative)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.primary.withOpacity(0.2)),
              ),
              child: Column(children: [
                if (_decodeLogoBytes() case final logoData?)
                  Image.memory(logoData, height: 36, fit: BoxFit.contain),
              Text(_settings.companyName ?? 'Vixor ERP', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              Text('תעודת משלוח / הסכם שכירות', style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
              ]),
            ),
            const SizedBox(height: 16),

            // ── Document type selector ─────────────────────────────────────
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('DOCUMENT TYPE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft)),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(8)),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _documentType,
                    isExpanded: true,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF0E1642), fontFamily: 'NotoSansHebrew'),
                    items: _docTypes.map((t) => DropdownMenuItem(value: t, child: Text(t, textDirection: TextDirection.rtl))).toList(),
                    onChanged: (v) { if (v != null) setState(() => _documentType = v); },
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 12),

            Row(children: [
              Expanded(child: GestureDetector(
                onTap: () async {
                  final now = DateTime.now();
                  DateTime initial = now;
                  try {
                    if (_dateCtrl.text.length == 10) {
                      initial = DateTime.parse(_dateCtrl.text);
                    }
                  } catch (_) {}
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: initial,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2030),
                  );
                  if (picked != null) {
                    setState(() => _dateCtrl.text = picked.toIso8601String().substring(0, 10));
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade400))),
                  child: Row(children: [
                    const Icon(Icons.calendar_today_outlined, size: 16, color: AppColors.inkSoft),
                    const SizedBox(width: 8),
                    Text(_dateCtrl.text.isEmpty ? 'Date' : _fmtDate(_dateCtrl.text),
                      style: TextStyle(fontSize: 15, color: _dateCtrl.text.isEmpty ? AppColors.inkSoft : null)),
                  ]),
                ),
              )),
              const SizedBox(width: 12),
              if (_note != null)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('№ ${_note!.noteNumber ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
            ]),

            ClientSearchField(
              controller: _clientNameCtrl,
              label: 'Client name',
              hintText: 'Search contacts or locations…',
              includeLocations: true,
              onSelected: ({String? role, String? phone}) {
                setState(() {
                  if (role != null && _roleCtrl.text.isEmpty) _roleCtrl.text = role;
                  if (phone != null && _clientPhoneCtrl.text.isEmpty) _clientPhoneCtrl.text = phone;
                });
              },
            ),
            _field('Client address', _clientAddrCtrl, cacheKey: 'clientAddress'),
            ClientSearchField(
              controller: _deliveredToCtrl,
              label: 'Delivered to',
              hintText: 'Search contacts…',
              includeLocations: false,
              onSelected: ({String? role, String? phone}) {
                setState(() {
                  if (role != null && _roleCtrl.text.isEmpty) _roleCtrl.text = role;
                });
              },
            ),
            Row(children: [
              Expanded(child: _field('Role', _roleCtrl, cacheKey: 'role')),
              const SizedBox(width: 12),
              Expanded(child: _field('ID number', _idNumCtrl, cacheKey: 'idNumber', keyboardType: TextInputType.number)),
            ]),

            const SizedBox(height: 6),
            // Equipment table
            const Text('EQUIPMENT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft)),
            const SizedBox(height: 6),
            Container(
              decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(8)),
              child: Column(children: [
                // Header
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: const BorderRadius.vertical(top: Radius.circular(7))),
                  child: const Row(children: [
                    SizedBox(width: 48, child: Text('Qty', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                    Expanded(child: Text('Item name', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                    SizedBox(width: 80, child: Text('Notes', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                    SizedBox(width: 30),
                  ]),
                ),
                const Divider(height: 1),
                ..._items.asMap().entries.map((e) => ItemRowWidget(
                  row: e.value,
                  onDelete: _items.length > 1 ? () => setState(() => _items.removeAt(e.key)) : null,
                  onBarcodeScanned: () => setState(() {}),
                )),
                TextButton.icon(
                  onPressed: () => setState(() => _items.add(ItemRow())),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add row', style: TextStyle(fontSize: 13)),
                ),
              ]),
            ),

            const SizedBox(height: 16),
            _field('Remarks', _remarksCtrl, maxLines: 3),

            // Signatures
            const SizedBox(height: 8),
            const Text('SIGNATURES', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _SigBox(
                label: 'Lessor signature',
                sig: _lessorSig,
                onTap: () => _captureSignature(isLessor: true),
              )),
              const SizedBox(width: 12),
              Expanded(child: _SigBox(
                label: 'Lessee signature',
                sig: _lesseeSig,
                onTap: () => _captureSignature(isLessor: false),
              )),
            ]),

            if (_lesseeSig != null) ...[
              const SizedBox(height: 10),
              _field('Lessee ID number', _lesseeIdCtrl, keyboardType: TextInputType.number),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Signature box ────────────────────────────────────────────────────────────


/// Decodes a signature that may be either:
///  - a plain base64 string (from in-app pad)
///  - a data URL  "data:image/png;base64,..."  (from the web signing page)
Uint8List _decodeSig(String sig) {
  final s = sig.contains(',') ? sig.split(',').last : sig;
  return base64Decode(s.replaceAll(RegExp(r'\s'), ''));
}

class _SigBox extends StatelessWidget {
  const _SigBox({required this.label, this.sig, required this.onTap});
  final String label;
  final String? sig;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 90,
        decoration: BoxDecoration(
          border: Border.all(color: sig != null ? AppColors.primary : Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
          color: sig != null ? AppColors.primary.withOpacity(0.04) : Colors.grey.shade50,
        ),
        child: sig != null
            ? Column(children: [
                Expanded(child: Image.memory(_decodeSig(sig!), fit: BoxFit.contain)),
                Text(label, style: const TextStyle(fontSize: 10, color: AppColors.inkSoft)),
                const SizedBox(height: 4),
              ])
            : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.draw_outlined, size: 24, color: AppColors.inkSoft),
                const SizedBox(height: 4),
                Text(label, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft), textAlign: TextAlign.center),
              ]),
      ),
    );
  }
}

extension _StringSlice on String {
  String slice(int start, int end) => substring(start, end < length ? end : length);
}

// ─── Native signature pad (no external package needed) ────────────────────────

class _SignaturePadScreen extends StatefulWidget {
  const _SignaturePadScreen({required this.title});
  final String title;
  @override
  State<_SignaturePadScreen> createState() => _SignaturePadScreenState();
}

class _SignaturePadScreenState extends State<_SignaturePadScreen> {
  final List<List<Offset>> _strokes = [];
  List<Offset> _current = [];
  bool _hasStrokes = false;

  void _onPanStart(DragStartDetails d) {
    _current = [d.localPosition];
    setState(() => _hasStrokes = true);
  }

  void _onPanUpdate(DragUpdateDetails d) {
    setState(() => _current.add(d.localPosition));
  }

  void _onPanEnd(DragEndDetails d) {
    _strokes.add(List.from(_current));
    _current = [];
  }

  Future<void> _confirm() async {
    if (_strokes.isEmpty && _current.isEmpty) return;
    // Render to image
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, const Rect.fromLTWH(0, 0, 300, 180));
    canvas.drawColor(Colors.white, BlendMode.src);
    final paint = Paint()
      ..color = Colors.black
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final stroke in [..._strokes, if (_current.isNotEmpty) _current]) {
      if (stroke.length < 2) continue;
      final path = Path()..moveTo(stroke[0].dx, stroke[0].dy);
      for (int i = 1; i < stroke.length; i++) {
        path.lineTo(stroke[i].dx, stroke[i].dy);
      }
      canvas.drawPath(path, paint);
    }
    final picture = recorder.endRecording();
    final img = await picture.toImage(300, 180);
    final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
    final b64 = base64Encode(bytes!.buffer.asUint8List());
    if (mounted) Navigator.of(context).pop(b64);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          TextButton(onPressed: () => setState(() { _strokes.clear(); _current = []; _hasStrokes = false; }), child: const Text('Clear')),
          FilledButton(onPressed: _hasStrokes ? _confirm : null, child: const Text('Confirm')),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: Column(children: [
          Container(
            margin: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade400),
              borderRadius: BorderRadius.circular(12),
              color: Colors.white,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: GestureDetector(
                onPanStart: _onPanStart,
                onPanUpdate: _onPanUpdate,
                onPanEnd: _onPanEnd,
                child: CustomPaint(
                  painter: _SignaturePainter(strokes: _strokes, current: _current),
                  size: const Size(double.infinity, 260),
                ),
              ),
            ),
          ),
          const Text('Sign above with your finger', style: TextStyle(color: AppColors.inkSoft, fontSize: 13)),
        ]),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  const _SignaturePainter({required this.strokes, required this.current});
  final List<List<Offset>> strokes;
  final List<Offset> current;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final stroke in [...strokes, current]) {
      if (stroke.length < 2) continue;
      final path = Path()..moveTo(stroke[0].dx, stroke[0].dy);
      for (int i = 1; i < stroke.length; i++) {
        path.lineTo(stroke[i].dx, stroke[i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(_SignaturePainter old) => true;
}

/// Simple TextField that saves value to FieldCache on blur.
class _CachedTextField extends StatefulWidget {
  const _CachedTextField({
    required this.cacheKey,
    required this.controller,
    this.keyboardType,
    this.maxLines = 1,
    this.label,
  });
  final String cacheKey;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final int maxLines;
  final String? label;
  @override
  State<_CachedTextField> createState() => _CachedTextFieldState();
}

class _CachedTextFieldState extends State<_CachedTextField> {
  final _focus = FocusNode();
  List<String> _recent = [];
  final _layerLink = LayerLink();
  OverlayEntry? _overlay;

  @override
  void initState() {
    super.initState();
    FieldCacheService.instance.recent(widget.cacheKey).then((r) {
      if (mounted) setState(() => _recent = r);
    });
    _focus.addListener(() {
      if (!_focus.hasFocus) {
        final v = widget.controller.text;
        if (v.trim().isNotEmpty) FieldCacheService.instance.save(widget.cacheKey, v);
        Future.delayed(const Duration(milliseconds: 150), _removeOverlay);
      } else if (widget.controller.text.isEmpty && _recent.isNotEmpty) {
        _showSuggestions();
      }
    });
  }

  @override
  void dispose() { _removeOverlay(); _focus.dispose(); super.dispose(); }

  void _showSuggestions() {
    _removeOverlay();
    if (_recent.isEmpty) return;
    _overlay = OverlayEntry(builder: (_) => Positioned(
      width: 280,
      child: CompositedTransformFollower(
        link: _layerLink,
        showWhenUnlinked: false,
        offset: const Offset(0, 52),
        child: Material(
          elevation: 4,
          borderRadius: BorderRadius.circular(8),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 160),
            child: ListView(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              children: _recent.map((v) => ListTile(
                dense: true,
                leading: const Icon(Icons.history, size: 15),
                title: Text(v, style: const TextStyle(fontSize: 13)),
                onTap: () { widget.controller.text = v; _removeOverlay(); },
              )).toList(),
            ),
          ),
        ),
      ),
    ));
    Overlay.of(context).insert(_overlay!);
  }

  void _removeOverlay() { _overlay?.remove(); _overlay = null; }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: TextField(
        controller: widget.controller,
        focusNode: _focus,
        keyboardType: widget.keyboardType,
        maxLines: widget.maxLines,
      ),
    );
  }
}
