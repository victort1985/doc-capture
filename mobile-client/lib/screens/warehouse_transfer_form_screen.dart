import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/api_service.dart';
import '../services/management_services.dart';
import '../services/field_cache_service.dart';
import 'barcode_scanner_screen.dart';

// ── Item row state ─────────────────────────────────────────────────────────────

class _TransferRow {
  final qtyCtrl  = TextEditingController(text: '1');
  final nameCtrl = TextEditingController();
  int? itemId;
  String? barcode;

  _TransferRow();

  TransferItemRecord toRecord() => TransferItemRecord(
    itemId: itemId,
    name: nameCtrl.text,
    quantity: int.tryParse(qtyCtrl.text) ?? 1,
    barcode: barcode,
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

class WarehouseTransferFormScreen extends StatefulWidget {
  const WarehouseTransferFormScreen({super.key, required this.svc});
  final WarehouseService svc;

  @override
  State<WarehouseTransferFormScreen> createState() => _WarehouseTransferFormScreenState();
}

class _WarehouseTransferFormScreenState extends State<WarehouseTransferFormScreen> {
  final _fromCtrl  = TextEditingController();
  final _toCtrl    = TextEditingController();
  final _notesCtrl = TextEditingController();
  List<_TransferRow> _rows = [_TransferRow()];
  bool _saving = false;

  @override
  void dispose() {
    _fromCtrl.dispose();
    _toCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _done() async {
    final validRows = _rows.where((r) => r.nameCtrl.text.isNotEmpty).toList();
    if (validRows.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add at least one item')));
      return;
    }
    setState(() => _saving = true);
    try {
      final transfer = await widget.svc.createTransfer({
        'fromLocation': _fromCtrl.text.isEmpty ? null : _fromCtrl.text,
        'toLocation': _toCtrl.text.isEmpty ? null : _toCtrl.text,
        'items': validRows.map((r) => r.toRecord().toJson()).toList(),
        if (_notesCtrl.text.isNotEmpty) 'notes': _notesCtrl.text,
      });

      // Generate and share PDF
      final pdf = await _buildPdf(transfer);
      final bytes = await pdf.save();
      final b64 = base64Encode(bytes);
      await widget.svc.storePdf(transfer.id, b64);

      if (!mounted) return;

      await Printing.layoutPdf(onLayout: (_) => bytes);

      if (mounted) Navigator.of(context).pop(transfer);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<pw.Document> _buildPdf(WarehouseTransfer transfer) async {
    final pdf = pw.Document();
    final fontR = await PdfGoogleFonts.notoSansHebrewRegular();
    final fontB = await PdfGoogleFonts.notoSansHebrewBold();

    final dateStr = DateTime.now().toIso8601String().substring(0, 10);

    pw.Widget t(String text, {pw.Font? font, double size = 10, pw.TextAlign? align}) =>
      pw.Text(text, style: pw.TextStyle(font: font ?? fontR, fontSize: size));

    pw.Widget cell(String text, {bool bold = false}) => pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 5),
      child: t(text, font: bold ? fontB : fontR, size: 9),
    );

    pdf.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(28),
      build: (ctx) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        // Header
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            t('Transfer Note', font: fontB, size: 18),
            t('№ ${transfer.noteNumber}', font: fontB, size: 13),
          ]),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            t('Date: $dateStr', size: 10),
            if (transfer.createdByUsername != null)
              t('By: ${transfer.createdByUsername}', size: 9),
          ]),
        ]),
        pw.SizedBox(height: 16),
        pw.Divider(thickness: 1, color: PdfColors.grey400),
        pw.SizedBox(height: 10),

        // Locations
        pw.Row(children: [
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            t('FROM', font: fontB, size: 9),
            pw.SizedBox(height: 2),
            pw.Container(
              padding: const pw.EdgeInsets.all(8),
              decoration: pw.BoxDecoration(border: pw.Border.all(width: 0.5, color: PdfColors.grey400), borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4))),
              child: t(transfer.fromLocation ?? '—', size: 11),
            ),
          ])),
          pw.SizedBox(width: 12),
          pw.Column(children: [
            pw.SizedBox(height: 14),
            pw.Text('→', style: pw.TextStyle(fontSize: 20, font: fontB)),
          ]),
          pw.SizedBox(width: 12),
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            t('TO', font: fontB, size: 9),
            pw.SizedBox(height: 2),
            pw.Container(
              padding: const pw.EdgeInsets.all(8),
              decoration: pw.BoxDecoration(border: pw.Border.all(width: 0.5, color: PdfColors.grey400), borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4))),
              child: t(transfer.toLocation ?? '—', size: 11),
            ),
          ])),
        ]),
        pw.SizedBox(height: 16),

        // Items table
        pw.Table(
          border: pw.TableBorder.all(width: 0.5, color: PdfColors.grey500),
          columnWidths: {
            0: const pw.FixedColumnWidth(45),
            1: const pw.FlexColumnWidth(4),
            2: const pw.FlexColumnWidth(2),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColors.grey200),
              children: [
                cell('Qty', bold: true),
                cell('Item name', bold: true),
                cell('Barcode', bold: true),
              ],
            ),
            ...transfer.items.map((item) => pw.TableRow(children: [
              cell('${item.quantity}'),
              cell(item.name),
              cell(item.barcode ?? ''),
            ])),
          ],
        ),

        if (transfer.notes != null && transfer.notes!.isNotEmpty) ...[
          pw.SizedBox(height: 12),
          t('Notes:', font: fontB, size: 9),
          pw.SizedBox(height: 4),
          t(transfer.notes!, size: 9),
        ],

        pw.SizedBox(height: 32),
        pw.Divider(thickness: 0.5, color: PdfColors.grey400),
        pw.SizedBox(height: 12),

        // Signature lines
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
          pw.Column(children: [
            pw.Container(width: 150, height: 0.5, color: PdfColors.black),
            pw.SizedBox(height: 4),
            t('Issued by', size: 9),
          ]),
          pw.Column(children: [
            pw.Container(width: 150, height: 0.5, color: PdfColors.black),
            pw.SizedBox(height: 4),
            t('Received by', size: 9),
          ]),
        ]),
      ]),
    ));
    return pdf;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('New Transfer'),
        actions: [
          _saving
            ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)))
            : FilledButton(onPressed: _done, child: const Text('Done')),
          const SizedBox(width: 8),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          // From / To
          Row(children: [
            Expanded(child: _LocationField(label: 'From location', controller: _fromCtrl, cacheKey: 'transfer.from')),
            const Padding(padding: EdgeInsets.only(top: 6, left: 6, right: 6), child: Icon(Icons.arrow_forward, color: AppColors.inkSoft)),
            Expanded(child: _LocationField(label: 'To location', controller: _toCtrl, cacheKey: 'transfer.to')),
          ]),
          const SizedBox(height: 16),

          // Items
          const Text('ITEMS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft)),
          const SizedBox(height: 6),
          Container(
            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(8)),
            child: Column(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: const BorderRadius.vertical(top: Radius.circular(7))),
                child: const Row(children: [
                  SizedBox(width: 50, child: Text('Qty', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                  Expanded(child: Text('Item name', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                  SizedBox(width: 32),
                  SizedBox(width: 30),
                ]),
              ),
              const Divider(height: 1),
              ..._rows.asMap().entries.map((e) => _TransferRowWidget(
                key: ObjectKey(e.value),
                row: e.value,
                svc: widget.svc,
                onDelete: _rows.length > 1 ? () => setState(() => _rows.removeAt(e.key)) : null,
              )),
              TextButton.icon(
                onPressed: () => setState(() => _rows.add(_TransferRow())),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add row', style: TextStyle(fontSize: 13)),
              ),
            ]),
          ),

          const SizedBox(height: 16),
          TextField(
            controller: _notesCtrl,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Notes (optional)', border: OutlineInputBorder()),
          ),
        ],
      ),
    );
  }
}

// ── Location autocomplete field ───────────────────────────────────────────────

class _LocationField extends StatefulWidget {
  const _LocationField({required this.label, required this.controller, required this.cacheKey});
  final String label;
  final TextEditingController controller;
  final String cacheKey;

  @override
  State<_LocationField> createState() => _LocationFieldState();
}

class _LocationFieldState extends State<_LocationField> {
  final _focus = FocusNode();
  final _layerLink = LayerLink();
  OverlayEntry? _overlay;
  List<String> _recent = [];

  @override
  void initState() {
    super.initState();
    FieldCacheService.instance.recent(widget.cacheKey).then((r) { if (mounted) setState(() => _recent = r); });
    _focus.addListener(() {
      if (_focus.hasFocus && widget.controller.text.isEmpty && _recent.isNotEmpty) {
        _showOverlay();
      } else if (!_focus.hasFocus) {
        FieldCacheService.instance.save(widget.cacheKey, widget.controller.text);
        Future.delayed(const Duration(milliseconds: 150), _removeOverlay);
      }
    });
  }

  @override
  void dispose() { _removeOverlay(); _focus.dispose(); super.dispose(); }

  void _showOverlay() {
    _removeOverlay();
    if (_recent.isEmpty) return;
    _overlay = OverlayEntry(builder: (_) => Positioned(
      width: 180,
      child: CompositedTransformFollower(
        link: _layerLink,
        showWhenUnlinked: false,
        offset: const Offset(0, 54),
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
                leading: const Icon(Icons.history, size: 14),
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
  Widget build(BuildContext context) => CompositedTransformTarget(
    link: _layerLink,
    child: TextField(
      controller: widget.controller,
      focusNode: _focus,
      decoration: InputDecoration(labelText: widget.label),
    ),
  );
}

// ── Item row widget ───────────────────────────────────────────────────────────

class _TransferRowWidget extends StatefulWidget {
  const _TransferRowWidget({super.key, required this.row, required this.svc, this.onDelete});
  final _TransferRow row;
  final WarehouseService svc;
  final VoidCallback? onDelete;

  @override
  State<_TransferRowWidget> createState() => _TransferRowWidgetState();
}

class _TransferRowWidgetState extends State<_TransferRowWidget> {
  final _focus = FocusNode();
  final _layerLink = LayerLink();
  OverlayEntry? _overlay;
  List<WarehouseItem> _suggestions = [];
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    widget.row.nameCtrl.addListener(_onTextChanged);
    _focus.addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    widget.row.nameCtrl.removeListener(_onTextChanged);
    _focus.removeListener(_onFocusChanged);
    _focus.dispose();
    _removeOverlay();
    super.dispose();
  }

  void _onFocusChanged() {
    if (!_focus.hasFocus) Future.delayed(const Duration(milliseconds: 150), _removeOverlay);
  }

  void _onTextChanged() {
    final q = widget.row.nameCtrl.text;
    if (q.length >= 2) _search(q);
    else _removeOverlay();
  }

  Future<void> _search(String q) async {
    setState(() => _searching = true);
    try {
      final items = await widget.svc.listItems(q: q);
      if (mounted) {
        setState(() { _suggestions = items; _searching = false; });
        if (items.isNotEmpty) _showOverlay();
        else _removeOverlay();
      }
    } catch (_) {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _pick(WarehouseItem item) {
    widget.row.nameCtrl.text = item.name;
    widget.row.nameCtrl.selection = TextSelection.fromPosition(TextPosition(offset: item.name.length));
    widget.row.itemId = item.id;
    widget.row.barcode = item.barcode;
    _removeOverlay();
  }

  void _showOverlay() {
    _removeOverlay();
    final renderBox = context.findRenderObject() as RenderBox?;
    if (renderBox == null) return;
    final size = renderBox.size;
    _overlay = OverlayEntry(
      builder: (_) => Positioned(
        width: size.width,
        child: CompositedTransformFollower(
          link: _layerLink,
          showWhenUnlinked: false,
          offset: Offset(0, size.height + 2),
          child: Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(8),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 200),
              child: ListView(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                children: _suggestions.map((item) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.inventory_2_outlined, size: 16, color: AppColors.inkSoft),
                  title: Text(item.name, style: const TextStyle(fontSize: 13)),
                  subtitle: Text('${item.quantity} ${item.unit ?? 'pcs'} · ${item.location ?? ''}', style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
                  onTap: () => _pick(item),
                )).toList(),
              ),
            ),
          ),
        ),
      ),
    );
    Overlay.of(context).insert(_overlay!);
  }

  void _removeOverlay() { _overlay?.remove(); _overlay = null; }

  Future<void> _scanBarcode() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
    );
    if (code == null || !mounted) return;
    final item = await widget.svc.findByBarcode(code);
    if (item != null) {
      widget.row.nameCtrl.text = item.name;
      widget.row.itemId = item.id;
      widget.row.barcode = item.barcode;
    } else {
      widget.row.nameCtrl.text = code;
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) => CompositedTransformTarget(
    link: _layerLink,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      child: Row(children: [
        SizedBox(width: 48, child: TextField(
          controller: widget.row.qtyCtrl,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 6)),
        )),
        const SizedBox(width: 6),
        Expanded(child: TextField(
          controller: widget.row.nameCtrl,
          focusNode: _focus,
          decoration: InputDecoration(
            isDense: true,
            hintText: 'Item name…',
            contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
            suffixIcon: _searching
              ? const SizedBox(width: 14, height: 14, child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator(strokeWidth: 2)))
              : null,
          ),
        )),
        SizedBox(width: 30, child: IconButton(
          icon: const Icon(Icons.qr_code_scanner, size: 18),
          onPressed: _scanBarcode,
          color: AppColors.primary,
          padding: EdgeInsets.zero,
          tooltip: 'Scan barcode',
        )),
        SizedBox(width: 28, child: IconButton(
          icon: const Icon(Icons.close, size: 16),
          onPressed: widget.onDelete,
          color: widget.onDelete != null ? Colors.red.shade300 : Colors.transparent,
          padding: EdgeInsets.zero,
        )),
      ]),
    ),
  );
}
