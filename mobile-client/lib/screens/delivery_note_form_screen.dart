import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../app/theme.dart';
import '../services/delivery_notes_service.dart';

class DeliveryNoteFormScreen extends StatefulWidget {
  const DeliveryNoteFormScreen({super.key, required this.svc, this.noteId});
  final DeliveryNotesService svc;
  final int? noteId;

  @override
  State<DeliveryNoteFormScreen> createState() => _DeliveryNoteFormScreenState();
}

class _DeliveryNoteFormScreenState extends State<DeliveryNoteFormScreen> {
  DeliveryNote? _note;
  bool _loading = true;
  bool _saving = false;

  // Form controllers
  final _clientNameCtrl  = TextEditingController();
  final _clientAddrCtrl  = TextEditingController();
  final _deliveredToCtrl = TextEditingController();
  final _roleCtrl        = TextEditingController();
  final _idNumCtrl       = TextEditingController();
  final _dateCtrl        = TextEditingController();
  final _remarksCtrl     = TextEditingController();
  final _lesseeIdCtrl    = TextEditingController();

  // Equipment rows
  List<_ItemRow> _items = [_ItemRow()];

  // Signatures (base64 PNG)
  String? _lessorSig;
  String? _lesseeSig;

  // Autocomplete suggestions
  List<String> _clientSuggestions = [];
  List<String> _fieldSuggestions = [];
  String? _activeSuggestionField;

  @override
  void initState() {
    super.initState();
    if (widget.noteId != null) {
      _loadExisting();
    } else {
      _dateCtrl.text = DateTime.now().toIso8601String().slice(0, 10);
      setState(() => _loading = false);
    }
  }

  Future<void> _loadExisting() async {
    try {
      final note = await widget.svc.getOne(widget.noteId!);
      _fillFrom(note);
      setState(() { _note = note; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _fillFrom(DeliveryNote n) {
    _clientNameCtrl.text  = n.clientName ?? '';
    _clientAddrCtrl.text  = n.clientAddress ?? '';
    _deliveredToCtrl.text = n.deliveredTo ?? '';
    _roleCtrl.text        = n.recipientRole ?? '';
    _idNumCtrl.text       = n.recipientIdNumber ?? '';
    _dateCtrl.text        = n.date ?? '';
    _remarksCtrl.text     = n.remarks ?? '';
    _lesseeIdCtrl.text    = n.lesseeIdNumber ?? '';
    _items = n.items.isNotEmpty
        ? n.items.map((i) => _ItemRow(quantity: i.quantity, name: i.name, notes: i.notes ?? '')).toList()
        : [_ItemRow()];
    _lessorSig = n.lessorSignature;
    _lesseeSig = n.lesseeSignature;
  }

  Future<void> _autocompleteClient(String q) async {
    if (q.length < 2) { setState(() => _clientSuggestions = []); return; }
    final s = await widget.svc.autocompleteClients(q);
    if (mounted) setState(() => _clientSuggestions = s);
  }

  Future<void> _autocompleteField(String field, String q) async {
    if (q.length < 2) { setState(() { _fieldSuggestions = []; _activeSuggestionField = null; }); return; }
    final s = await widget.svc.autocompleteField(field, q);
    if (mounted) setState(() { _fieldSuggestions = s; _activeSuggestionField = field; });
  }

  Map<String, dynamic> _toDto() => {
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

  Future<pw.Document> _buildPdf() async {
    final pdf = pw.Document();
    // Decode signatures if present
    pw.MemoryImage? lessorImg;
    pw.MemoryImage? lesseeImg;
    if (_lessorSig != null) lessorImg = pw.MemoryImage(base64Decode(_lessorSig!));
    if (_lesseeSig != null) lesseeImg = pw.MemoryImage(base64Decode(_lesseeSig!));

    pdf.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(24),
      theme: pw.ThemeData.withFont(
        base: await PdfGoogleFonts.notoSansRegular(),
        bold: await PdfGoogleFonts.notoSansBold(),
      ),
      build: (c) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
        // Header
        pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('אם.סי. אילת מיוזיק בע"מ', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 14)),
            pw.Text('THE MUSICAL CONNECTION', style: const pw.TextStyle(fontSize: 9)),
            pw.SizedBox(height: 4),
            pw.Text('נחל חיון 3/3, אילת | 08-6315342', style: const pw.TextStyle(fontSize: 9)),
          ])),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Text('תעודת משלוח/ו/אי', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 14)),
            pw.Text('הסכם שכירות ו/או ביצוע עבודה', style: const pw.TextStyle(fontSize: 10)),
            pw.Text('מס׳ ${_note?.noteNumber ?? ''}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12)),
          ]),
        ]),
        pw.Divider(),
        pw.SizedBox(height: 6),

        // Client info
        pw.Row(children: [
          _pdfField('תאריך', _dateCtrl.text),
          pw.SizedBox(width: 20),
          _pdfField('שם', _clientNameCtrl.text, flex: 3),
        ]),
        pw.SizedBox(height: 6),
        pw.Row(children: [
          _pdfField('כתובת', _clientAddrCtrl.text, flex: 3),
          pw.SizedBox(width: 20),
          _pdfField('נמסר לידי', _deliveredToCtrl.text, flex: 2),
        ]),
        pw.SizedBox(height: 6),
        pw.Row(children: [
          _pdfField('תפקיד', _roleCtrl.text),
          pw.SizedBox(width: 20),
          _pdfField('מס׳ ת.ז.', _idNumCtrl.text),
        ]),
        pw.SizedBox(height: 12),

        // Items table
        pw.Table(
          border: pw.TableBorder.all(width: 0.5),
          columnWidths: {
            0: const pw.FixedColumnWidth(50),
            1: const pw.FlexColumnWidth(4),
            2: const pw.FlexColumnWidth(2),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColors.grey200),
              children: [
                _pdfCell('כמות', bold: true),
                _pdfCell('שמות הפריטים', bold: true),
                _pdfCell('הערות', bold: true),
              ],
            ),
            ..._items.where((r) => r.nameCtrl.text.isNotEmpty).map((r) => pw.TableRow(children: [
              _pdfCell(r.qtyCtrl.text.isEmpty ? '1' : r.qtyCtrl.text),
              _pdfCell(r.nameCtrl.text),
              _pdfCell(r.notesCtrl.text),
            ])),
            // Empty rows to match original
            ...List.generate(
              (_items.where((r) => r.nameCtrl.text.isNotEmpty).length < 8
                  ? 8 - _items.where((r) => r.nameCtrl.text.isNotEmpty).length
                  : 2),
              (_) => pw.TableRow(children: [_pdfCell(''), _pdfCell(''), _pdfCell('')]),
            ),
          ],
        ),

        if (_remarksCtrl.text.isNotEmpty) ...[
          pw.SizedBox(height: 8),
          pw.Text('הערות: ${_remarksCtrl.text}', style: const pw.TextStyle(fontSize: 9)),
        ],

        pw.Spacer(),

        // Signatures
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
            if (lessorImg != null)
              pw.Image(lessorImg, width: 100, height: 50, fit: pw.BoxFit.contain),
            pw.Container(width: 120, height: 0.5, color: PdfColors.black),
            pw.SizedBox(height: 4),
            pw.Text('חתימת המשכיר', style: const pw.TextStyle(fontSize: 9)),
          ]),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
            if (lesseeImg != null)
              pw.Image(lesseeImg, width: 100, height: 50, fit: pw.BoxFit.contain),
            pw.Container(width: 120, height: 0.5, color: PdfColors.black),
            pw.SizedBox(height: 4),
            pw.Text('חתימת השוכר', style: const pw.TextStyle(fontSize: 9)),
            if (_lesseeIdCtrl.text.isNotEmpty)
              pw.Text('מסי ת.ז. ${_lesseeIdCtrl.text}', style: const pw.TextStyle(fontSize: 8)),
          ]),
        ]),
      ]),
    ));
    return pdf;
  }

  pw.Widget _pdfField(String label, String value, {int flex = 1}) =>
    pw.Expanded(flex: flex, child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
      pw.Text('$label: ', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9)),
      pw.Expanded(child: pw.Container(
        decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(width: 0.5))),
        child: pw.Text(value, style: const pw.TextStyle(fontSize: 10)),
      )),
    ]));

  pw.Widget _pdfCell(String text, {bool bold = false}) =>
    pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: pw.Text(text, style: pw.TextStyle(fontSize: 9, fontWeight: bold ? pw.FontWeight.bold : null)),
    );

  Widget _suggestionList(List<String> suggestions, TextEditingController ctrl, VoidCallback onPick) {
    if (suggestions.isEmpty) return const SizedBox.shrink();
    return Material(
      elevation: 4,
      borderRadius: BorderRadius.circular(8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: suggestions.map((s) => InkWell(
          onTap: () { ctrl.text = s; onPick(); },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            child: Text(s, style: const TextStyle(fontSize: 13)),
          ),
        )).toList(),
      ),
    );
  }

  Widget _field(String label, TextEditingController ctrl, {
    TextInputType? keyboardType,
    String? field, // for autocomplete
    bool required = false,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft)),
        const SizedBox(height: 4),
        TextField(
          controller: ctrl,
          keyboardType: keyboardType,
          maxLines: maxLines,
          onChanged: (v) {
            if (field == 'clientName') _autocompleteClient(v);
            else if (field != null) _autocompleteField(field, v);
          },
        ),
        if (field == 'clientName' && _clientSuggestions.isNotEmpty)
          _suggestionList(_clientSuggestions, ctrl, () => setState(() => _clientSuggestions = [])),
        if (field != null && field != 'clientName' && _activeSuggestionField == field && _fieldSuggestions.isNotEmpty)
          _suggestionList(_fieldSuggestions, ctrl, () => setState(() { _fieldSuggestions = []; _activeSuggestionField = null; })),
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
            tooltip: 'Generate & send PDF',
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
              child: const Column(children: [
                Text('אם.סי. אילת מיוזיק בע"מ', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                Text('תעודת משלוח / הסכם שכירות', style: TextStyle(fontSize: 13, color: AppColors.inkSoft)),
              ]),
            ),
            const SizedBox(height: 16),

            Row(children: [
              Expanded(child: _field('Date', _dateCtrl, keyboardType: TextInputType.datetime)),
              const SizedBox(width: 12),
              if (_note != null)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('№ ${_note!.noteNumber ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
            ]),

            _field('Client name', _clientNameCtrl, field: 'clientName', required: true),
            _field('Client address', _clientAddrCtrl, field: 'clientAddress'),
            _field('Delivered to', _deliveredToCtrl, field: 'deliveredTo'),
            Row(children: [
              Expanded(child: _field('Role', _roleCtrl, field: 'recipientRole')),
              const SizedBox(width: 12),
              Expanded(child: _field('ID number', _idNumCtrl, field: 'lesseeIdNumber', keyboardType: TextInputType.number)),
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
                ..._items.asMap().entries.map((e) => _ItemRowWidget(
                  row: e.value,
                  onDelete: _items.length > 1 ? () => setState(() => _items.removeAt(e.key)) : null,
                )),
                TextButton.icon(
                  onPressed: () => setState(() => _items.add(_ItemRow())),
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

// ─── Item row widget ──────────────────────────────────────────────────────────

class _ItemRow {
  final qtyCtrl   = TextEditingController(text: '1');
  final nameCtrl  = TextEditingController();
  final notesCtrl = TextEditingController();
  _ItemRow({int quantity = 1, String name = '', String notes = ''}) {
    qtyCtrl.text   = '$quantity';
    nameCtrl.text  = name;
    notesCtrl.text = notes;
  }
}

class _ItemRowWidget extends StatelessWidget {
  const _ItemRowWidget({required this.row, this.onDelete});
  final _ItemRow row;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
    child: Row(children: [
      SizedBox(width: 46, child: TextField(controller: row.qtyCtrl, keyboardType: TextInputType.number, textAlign: TextAlign.center, decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 6)))),
      const SizedBox(width: 6),
      Expanded(child: TextField(controller: row.nameCtrl, decoration: const InputDecoration(isDense: true, hintText: 'Item name…', contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 6)))),
      const SizedBox(width: 6),
      SizedBox(width: 76, child: TextField(controller: row.notesCtrl, decoration: const InputDecoration(isDense: true, hintText: 'Notes', contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 6)))),
      SizedBox(width: 30, child: IconButton(
        icon: const Icon(Icons.close, size: 16),
        onPressed: onDelete,
        color: onDelete != null ? Colors.red.shade300 : Colors.transparent,
        padding: EdgeInsets.zero,
      )),
    ]),
  );
}

// ─── Signature box ────────────────────────────────────────────────────────────

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
                Expanded(child: Image.memory(base64Decode(sig!), fit: BoxFit.contain)),
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
