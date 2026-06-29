import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/management_services.dart';
import '../services/pdf_helpers.dart';
import '../services/field_cache_service.dart';
import '../widgets/phone_book_search_field.dart';
import 'barcode_scanner_screen.dart';

// ─── Location/client quick-search bar ────────────────────────────────────────

class _WarehouseSearchBar extends StatefulWidget {
  const _WarehouseSearchBar({required this.svc, required this.onLocationPicked});
  final WarehouseService svc;
  final void Function(String? location) onLocationPicked;

  @override
  State<_WarehouseSearchBar> createState() => _WarehouseSearchBarState();
}

class _WarehouseSearchBarState extends State<_WarehouseSearchBar> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  final _layerLink = LayerLink();
  OverlayEntry? _overlay;
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _ctrl.addListener(_onChanged);
    _focus.addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    _ctrl.removeListener(_onChanged);
    _focus.removeListener(_onFocusChanged);
    _removeOverlay();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (!_focus.hasFocus) Future.delayed(const Duration(milliseconds: 150), _removeOverlay);
  }

  void _onChanged() {
    final q = _ctrl.text.trim();
    if (q.isEmpty) { _removeOverlay(); return; }
    if (q.length >= 1) _search(q);
  }

  Future<void> _search(String q) async {
    setState(() => _searching = true);
    try {
      final api = context.read<ApiService>();
      final results = await Future.wait([
        widget.svc.listLocations(q: q),
        api.get('/phonebook/search?q=${Uri.encodeComponent(q)}') as Future,
      ]);
      final locs = results[0] as List<String>;
      final contacts = ((results[1] as List?) ?? [])
          .map((j) => PhoneContact.fromJson(j as Map<String, dynamic>))
          .toList();
      if (mounted) {
        setState(() => _searching = false);
        if (locs.isEmpty && contacts.isEmpty) { _removeOverlay(); return; }
        _showOverlay(locs, contacts);
      }
    } catch (_) {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _pick(String value) {
    _ctrl.text = value;
    _ctrl.selection = TextSelection.fromPosition(TextPosition(offset: value.length));
    _removeOverlay();
    widget.onLocationPicked(value);
  }

  void _clear() {
    _ctrl.clear();
    _removeOverlay();
    widget.onLocationPicked(null);
  }

  void _showOverlay(List<String> locs, List<PhoneContact> contacts) {
    _removeOverlay();
    final renderBox = context.findRenderObject() as RenderBox?;
    final size = renderBox?.size ?? const Size(300, 44);
    _overlay = OverlayEntry(builder: (_) => Positioned(
      width: size.width,
      child: CompositedTransformFollower(
        link: _layerLink,
        showWhenUnlinked: false,
        offset: Offset(0, size.height + 2),
        child: Material(
          elevation: 6,
          borderRadius: BorderRadius.circular(10),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240),
            child: ListView(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              children: [
                ...locs.map((loc) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.warehouse_outlined, size: 16, color: AppColors.inkSoft),
                  title: Text(loc, style: const TextStyle(fontSize: 13)),
                  onTap: () => _pick(loc),
                )),
                ...contacts.map((c) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.person_outline, size: 16, color: AppColors.inkSoft),
                  title: Text(c.name, style: const TextStyle(fontSize: 13)),
                  subtitle: c.phone != null ? Text(c.phone!, style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)) : null,
                  onTap: () => _pick(c.name),
                )),
              ],
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
      controller: _ctrl,
      focusNode: _focus,
      decoration: InputDecoration(
        hintText: 'Search by location or client…',
        prefixIcon: const Icon(Icons.search, size: 20),
        suffixIcon: _searching
          ? const SizedBox(width: 14, height: 14, child: Padding(padding: EdgeInsets.all(10), child: CircularProgressIndicator(strokeWidth: 2)))
          : _ctrl.text.isNotEmpty
            ? IconButton(icon: const Icon(Icons.close, size: 18), onPressed: _clear)
            : null,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        filled: true,
        fillColor: Colors.white,
      ),
    ),
  );
}

// ─── Barcode generator (client-side, random) ──────────────────────────────────

String generateLocalBarcode() {
  // DC + 10 random digits — unique enough for warehouse use, doesn't hit
  // the server until the user explicitly links it to an item.
  final rng = Random.secure();
  final digits = List.generate(10, (_) => rng.nextInt(10)).join();
  return 'DC$digits';
}

// ─── Main screen ──────────────────────────────────────────────────────────────

class WarehouseScreen extends StatefulWidget {
  const WarehouseScreen({super.key});
  @override
  State<WarehouseScreen> createState() => _WarehouseScreenState();
}

class _WarehouseScreenState extends State<WarehouseScreen> {
  late WarehouseService _svc;
  List<WarehouseItem> _items = [];
  List<WarehouseCategory> _categories = [];
  int? _selectedCategoryId;
  String? _selectedLocation;
  List<String> _locations = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _svc = WarehouseService(context.read<ApiService>());
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final cats = await _svc.listCategories();
      final items = await _svc.listItems(categoryId: _selectedCategoryId);
      // Extract unique non-null locations, sorted
      final locs = items
          .map((i) => i.location)
          .whereType<String>()
          .toSet()
          .toList()
        ..sort();
      if (mounted) setState(() {
        _categories = cats;
        _items = items;
        _locations = locs;
        // Keep current selection if still valid; otherwise default to first location
        if (_selectedLocation != null && !locs.contains(_selectedLocation)) {
          _selectedLocation = locs.isNotEmpty ? locs.first : null;
        } else if (_selectedLocation == null && locs.isNotEmpty) {
          _selectedLocation = locs.first;
        }
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Generate + print barcode ──────────────────────────────────────────────

  Future<void> _generateAndPrint() async {
    final code = generateLocalBarcode();
    // Show barcode and print dialog
    if (!mounted) return;
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Generated barcode'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(8), color: Colors.white),
            child: Column(children: [
              // Visual barcode representation (lines)
              _BarcodeVisual(data: code),
              const SizedBox(height: 6),
              Text(code, style: const TextStyle(fontFamily: 'Courier', fontSize: 14, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
            ]),
          ),
          const SizedBox(height: 12),
          const Text('Scan this barcode when adding\nan item to the warehouse.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkSoft, fontSize: 13)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
          FilledButton.icon(
            onPressed: () async {
              Navigator.pop(ctx);
              await _printBarcode(code);
            },
            icon: const Icon(Icons.print_outlined, size: 16),
            label: const Text('Print'),
          ),
        ],
      ),
    );
  }

  Future<void> _printBarcode(String code) async {
    final pdf = pw.Document();
    pdf.addPage(pw.Page(
      pageFormat: const PdfPageFormat(62 * PdfPageFormat.mm, 30 * PdfPageFormat.mm),
      margin: const pw.EdgeInsets.all(4 * PdfPageFormat.mm),
      build: (c) => pw.Column(
        mainAxisAlignment: pw.MainAxisAlignment.center,
        children: [
          pw.BarcodeWidget(data: code, barcode: pw.Barcode.code128(), height: 15 * PdfPageFormat.mm),
          pw.SizedBox(height: 2 * PdfPageFormat.mm),
          pw.Text(code, style: const pw.TextStyle(fontSize: 8)),
        ],
      ),
    ));
    await Printing.layoutPdf(onLayout: (_) => pdf.save());
  }

  // ── Scan and link barcode to item ─────────────────────────────────────────

  Future<void> _scanToAddItem() async {
    final l10n = AppLocalizations.of(context)!;
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
    );
    if (code == null || !mounted) return;

    // Check if already linked
    final existing = await _svc.findByBarcode(code);
    if (!mounted) return;
    if (existing != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Barcode already linked to: ${existing.name}')));
      _showItemDetail(existing);
      return;
    }

    // New barcode — link to item
    await _showAddItemDialog(prefilledBarcode: code);
  }

  // ── Add item dialog ───────────────────────────────────────────────────────

  Future<void> _showAddItemDialog({String? prefilledBarcode}) async {
    final l10n = AppLocalizations.of(context)!;
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final unitCtrl = TextEditingController();
    final locCtrl  = TextEditingController();
    final qtyCtrl  = TextEditingController(text: '0');
    int? catId;
    String barcode = prefilledBarcode ?? generateLocalBarcode();

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSt) => AlertDialog(
        title: Text(l10n.warehouseAddItem),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameCtrl, decoration: InputDecoration(labelText: l10n.warehouseName)),
          TextField(controller: descCtrl, decoration: InputDecoration(labelText: l10n.warehouseDescription)),
          DropdownButtonFormField<int>(
            value: catId,
            hint: Text(l10n.warehouseCategory),
            items: _categories.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))).toList(),
            onChanged: (v) => setSt(() => catId = v),
          ),
          TextField(controller: qtyCtrl, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.warehouseQty)),
          TextField(controller: unitCtrl, decoration: InputDecoration(labelText: l10n.warehouseUnit)),
          TextField(controller: locCtrl, decoration: InputDecoration(labelText: l10n.warehouseLocation)),
          const SizedBox(height: 8),
          // Barcode row — shows current code + scan button
          Row(children: [
            Expanded(
              child: GestureDetector(
                onTap: () { Clipboard.setData(ClipboardData(text: barcode)); ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Barcode copied'))); },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(6), color: Colors.grey.shade50),
                  child: Text(barcode, style: const TextStyle(fontFamily: 'Courier', fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1), overflow: TextOverflow.ellipsis),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: const Icon(Icons.qr_code_scanner),
              tooltip: l10n.warehouseScan,
              onPressed: () async {
                final scanned = await Navigator.of(ctx).push<String>(
                  MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
                );
                if (scanned != null && scanned.isNotEmpty) {
                  setSt(() => barcode = scanned);
                }
              },
            ),
          ]),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () async {
              if (nameCtrl.text.trim().isEmpty) return;
              await _svc.createItem({
                'name': nameCtrl.text.trim(),
                'barcode': barcode,
                'quantity': int.tryParse(qtyCtrl.text) ?? 0,
                if (descCtrl.text.isNotEmpty) 'description': descCtrl.text.trim(),
                if (catId != null) 'categoryId': catId,
                if (unitCtrl.text.isNotEmpty) 'unit': unitCtrl.text.trim(),
                if (locCtrl.text.isNotEmpty) 'location': locCtrl.text.trim(),
              });
              if (ctx.mounted) Navigator.pop(ctx);
              _load();
            },
            child: Text(l10n.calendarSave),
          ),
        ],
      )),
    );
  }

  void _showItemDetail(WarehouseItem item) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _ItemDetailSheet(item: item, svc: _svc, onRefresh: _load),
    );
  }

  Future<void> _printAllPdf() async {
    final l10n = AppLocalizations.of(context)!;
    final rows = _selectedCategoryId != null ? _items : await _svc.listItems();

    final fontR = await PdfGoogleFonts.notoSansHebrewRegular();
    final fontB = await PdfGoogleFonts.notoSansHebrewBold();

    // Try to get org settings for logo/company name
    String companyName = 'Vixor ERP';
    pw.ImageProvider? logoImg;
    try {
      final settings = await _svc.getOrgSettings();
      if (settings['companyName'] != null) companyName = settings['companyName'] as String;
      final logoBytes = decodeLogoBytes(settings['logoBase64'] as String?);
      if (logoBytes != null) logoImg = pw.MemoryImage(logoBytes);
    } catch (_) {}

    final pdf = pw.Document();
    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(24),
      // Logo + company on every page
      header: (ctx) => pw.Container(
        padding: const pw.EdgeInsets.only(bottom: 6),
        decoration: const pw.BoxDecoration(
          border: pw.Border(bottom: pw.BorderSide(width: 0.5, color: PdfColors.grey400))),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          crossAxisAlignment: pw.CrossAxisAlignment.center,
          children: [
            pw.Text(companyName, style: pw.TextStyle(font: fontB, fontSize: 11),
              textDirection: pw.TextDirection.rtl),
            if (logoImg != null)
              pw.Image(logoImg, height: 30, fit: pw.BoxFit.contain),
          ],
        ),
      ),
      build: (c) => [
        pw.SizedBox(height: 8),
        pw.Text(l10n.warehouseInventoryReport,
          style: pw.TextStyle(font: fontB, fontSize: 16),
          textDirection: pw.TextDirection.rtl),
        pw.SizedBox(height: 4),
        pw.Text(DateTime.now().toLocal().toString().substring(0, 16),
          style: pw.TextStyle(font: fontR, fontSize: 9, color: PdfColors.grey600)),
        pw.SizedBox(height: 12),
        pw.Table(
          border: pw.TableBorder.all(width: 0.5),
          columnWidths: {
            0: const pw.FixedColumnWidth(28),
            1: const pw.FlexColumnWidth(3),
            2: const pw.FlexColumnWidth(2),
            3: const pw.FlexColumnWidth(2),
            4: const pw.FixedColumnWidth(30),
            5: const pw.FixedColumnWidth(30),
            6: const pw.FlexColumnWidth(2),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColors.grey200),
              children: ['#', 'Name', 'Barcode', 'Category', 'Qty', 'Unit', 'Location']
                .map((h) => pw.Padding(
                  padding: const pw.EdgeInsets.symmetric(horizontal: 3, vertical: 4),
                  child: pw.Text(h, style: pw.TextStyle(font: fontB, fontSize: 8)),
                )).toList(),
            ),
            ...rows.asMap().entries.map((e) => pw.TableRow(children: [
              '${e.key + 1}', e.value.name, e.value.barcode,
              e.value.category?.name ?? '—', '${e.value.quantity}',
              e.value.unit ?? '—', e.value.location ?? '—',
            ].map((text) => pw.Padding(
              padding: const pw.EdgeInsets.symmetric(horizontal: 3, vertical: 4),
              child: pw.Text(text,
                style: pw.TextStyle(font: fontR, fontSize: 8),
                textDirection: pw.TextDirection.rtl),
            )).toList())),
          ],
        ),
        pw.SizedBox(height: 8),
        pw.Text('${l10n.warehouseInventoryReport} — ${rows.length} items',
          style: pw.TextStyle(font: fontR, fontSize: 9, color: PdfColors.grey600)),
      ],
    ));
    await Printing.layoutPdf(onLayout: (_) => pdf.save());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    // Filter by selected location, then group by category
    final visibleItems = _selectedLocation == null
        ? _items
        : _items.where((i) => i.location == _selectedLocation).toList();

    final Map<String, List<WarehouseItem>> grouped = {};
    for (final item in visibleItems) {
      final key = item.category?.name ?? 'Uncategorized';
      grouped.putIfAbsent(key, () => []).add(item);
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(children: [
        // Toolbar
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 4),
          child: Row(children: [
            Expanded(child: Text(l10n.warehouseTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18))),
            IconButton.outlined(icon: const Icon(Icons.qr_code_outlined, size: 20), tooltip: 'Generate barcode', onPressed: _generateAndPrint),
            IconButton.outlined(icon: const Icon(Icons.qr_code_scanner, size: 20), tooltip: l10n.warehouseScan, onPressed: _scanToAddItem),
            IconButton.outlined(icon: const Icon(Icons.picture_as_pdf_outlined, size: 20), tooltip: l10n.warehousePrint, onPressed: _printAllPdf),
          ]),
        ),

        // Quick-search bar
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 6),
          child: _WarehouseSearchBar(
            svc: _svc,
            onLocationPicked: (loc) => setState(() => _selectedLocation = loc),
          ),
        ),

        // Location filter chips
        if (_locations.isNotEmpty)
          SizedBox(
            height: 34,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              children: [
                _CatChip(label: l10n.warehouseAll, selected: _selectedLocation == null, onTap: () => setState(() => _selectedLocation = null)),
                ..._locations.map((loc) => _CatChip(label: loc, selected: _selectedLocation == loc, onTap: () => setState(() => _selectedLocation = loc))),
              ],
            ),
          ),
        const SizedBox(height: 2),

        // Category filter chips
        if (_categories.isNotEmpty)
          SizedBox(
            height: 34,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              children: [
                _CatChip(label: l10n.warehouseAll, selected: _selectedCategoryId == null, onTap: () { setState(() => _selectedCategoryId = null); _load(); }),
                ..._categories.map((c) => _CatChip(label: c.name, selected: _selectedCategoryId == c.id, onTap: () { setState(() => _selectedCategoryId = c.id); _load(); })),
              ],
            ),
          ),
        const SizedBox(height: 4),

        // Item list grouped by category
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : visibleItems.isEmpty
                  ? Center(child: Text(l10n.warehouseEmpty, style: const TextStyle(color: AppColors.inkSoft)))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(10, 0, 10, 80),
                        children: grouped.entries.map((entry) => _CategorySection(
                          name: entry.key,
                          items: entry.value,
                          onTap: _showItemDetail,
                        )).toList(),
                      ),
                    ),
        ),
      ]),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddItemDialog(),
        child: const Icon(Icons.add),
      ),
    );
  }
}

// ─── Category section ─────────────────────────────────────────────────────────

class _CategorySection extends StatelessWidget {
  const _CategorySection({required this.name, required this.items, required this.onTap});
  final String name;
  final List<WarehouseItem> items;
  final void Function(WarehouseItem) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(2, 14, 2, 6),
        child: Text(name.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: AppColors.inkSoft)),
      ),
      ...items.map((item) => Card(
        margin: const EdgeInsets.only(bottom: 6),
        child: ListTile(
          onTap: () => onTap(item),
          title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: item.location != null ? Text(item.location!, style: const TextStyle(fontSize: 12)) : null,
          trailing: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('${item.quantity}', style: TextStyle(
              fontWeight: FontWeight.w800, fontSize: 20,
              color: item.quantity == 0 ? Colors.red : AppColors.primary,
            )),
            if (item.unit != null) Text(item.unit!, style: const TextStyle(fontSize: 10, color: AppColors.inkSoft)),
          ]),
        ),
      )),
    ]);
  }
}

// ─── Item detail sheet ────────────────────────────────────────────────────────

class _ItemDetailSheet extends StatefulWidget {
  const _ItemDetailSheet({required this.item, required this.svc, required this.onRefresh});
  final WarehouseItem item;
  final WarehouseService svc;
  final VoidCallback onRefresh;
  @override
  State<_ItemDetailSheet> createState() => _ItemDetailSheetState();
}

class _ItemDetailSheetState extends State<_ItemDetailSheet> {
  List<WarehouseItem> _sameNameItems = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadSameNameItems();
  }

  Future<void> _loadSameNameItems() async {
    setState(() => _loading = true);
    try {
      final all = await widget.svc.listItems();
      final same = all.where((i) => i.name.toLowerCase() == widget.item.name.toLowerCase()).toList();
      if (mounted) setState(() { _sameNameItems = same; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addTx(String type) async {
    final l10n = AppLocalizations.of(context)!;
    final qtyCtrl    = TextEditingController(text: '1');
    final reasonCtrl = TextEditingController();
    // Barcode: pre-filled with current item's barcode, can be changed by scanning
    String barcode = widget.item.barcode;
    bool _scanning = false;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSt) => AlertDialog(
        title: Text(type == 'in' ? l10n.warehouseIn : l10n.warehouseOut),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          // Barcode row with scan button
          Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            Expanded(
              child: GestureDetector(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: barcode));
                  ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Barcode copied'), duration: Duration(seconds: 1)));
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(6),
                    color: Colors.grey.shade50,
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Barcode', style: TextStyle(fontSize: 10, color: AppColors.inkSoft)),
                    Text(barcode, style: const TextStyle(fontFamily: 'Courier', fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1), overflow: TextOverflow.ellipsis),
                  ]),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: _scanning
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.qr_code_scanner),
              tooltip: l10n.warehouseScan,
              onPressed: _scanning ? null : () async {
                setSt(() => _scanning = true);
                try {
                  final scanned = await Navigator.of(ctx).push<String>(
                    MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
                  );
                  if (scanned != null && scanned.isNotEmpty) {
                    setSt(() => barcode = scanned);
                    // If scanned barcode belongs to different item — show info
                    final found = await widget.svc.findByBarcode(scanned);
                    if (found != null && found.id != widget.item.id && ctx.mounted) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        SnackBar(content: Text('Barcode linked to: ${found.name}'), duration: const Duration(seconds: 2)),
                      );
                    }
                  }
                } finally {
                  if (ctx.mounted) setSt(() => _scanning = false);
                }
              },
            ),
          ]),
          const SizedBox(height: 8),
          TextField(
            controller: qtyCtrl,
            keyboardType: TextInputType.number,
            autofocus: true,
            decoration: InputDecoration(labelText: l10n.warehouseQty),
          ),
          TextField(
            controller: reasonCtrl,
            decoration: InputDecoration(labelText: l10n.warehouseReason),
          ),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () async {
              final qty = int.tryParse(qtyCtrl.text);
              if (qty == null || qty <= 0) return;
              // If barcode changed from original, link new barcode to this item name
              WarehouseItem targetItem = widget.item;
              if (barcode != widget.item.barcode && type == 'in') {
                // Try to find existing item with this barcode
                final found = await widget.svc.findByBarcode(barcode);
                if (found != null) {
                  targetItem = found;
                } else {
                  // Create new item with same name but new barcode
                  final created = await widget.svc.createItem({
                    'name': widget.item.name,
                    'barcode': barcode,
                    'quantity': 0,
                    if (widget.item.category != null) 'categoryId': widget.item.category!.id,
                    if (widget.item.unit != null) 'unit': widget.item.unit,
                    if (widget.item.location != null) 'location': widget.item.location,
                  });
                  targetItem = created;
                }
              }
              await widget.svc.addTransaction(targetItem.id, type, qty, reason: reasonCtrl.text.isNotEmpty ? reasonCtrl.text : null);
              if (ctx.mounted) Navigator.pop(ctx);
              widget.onRefresh();
            },
            child: Text(l10n.calendarSave),
          ),
        ],
      )),
    );
  }

  Future<void> _showRepairDialog(BuildContext context, AppLocalizations l10n) async {
    final supplierCtrl = TextEditingController();
    final phoneCtrl    = TextEditingController();
    final emailCtrl    = TextEditingController();
    final reasonCtrl   = TextEditingController();
    String barcode = widget.item.barcode;
    bool scanning = false;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSt) => AlertDialog(
        title: Row(children: [
          const Icon(Icons.build_outlined, size: 20),
          const SizedBox(width: 8),
          Text(l10n.warehouseSendToRepair),
        ]),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [

          // Supplier — phone book search
          PhoneBookSearchField(
            fieldKey: 'repair.supplier',
            controller: supplierCtrl,
            label: l10n.warehouseSupplier,
            contactFilter: 'supplier',
            onContactSelected: (c) {
              if (c.phone != null) phoneCtrl.text = c.phone!;
              if (c.email != null) emailCtrl.text = c.email!;
            },
          ),
          const SizedBox(height: 8),
          TextField(controller: phoneCtrl, keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: l10n.warehouseSupplierPhone)),
          const SizedBox(height: 8),
          TextField(controller: emailCtrl, keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(labelText: l10n.warehouseSupplierEmail)),
          const SizedBox(height: 8),
          TextField(controller: reasonCtrl, maxLines: 2,
              decoration: InputDecoration(labelText: l10n.warehouseReason)),
          const SizedBox(height: 12),

          // Barcode row with scanner
          Row(children: [
            Expanded(child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(6),
                color: Colors.grey.shade50,
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Barcode', style: TextStyle(fontSize: 10, color: AppColors.inkSoft)),
                Text(barcode, style: const TextStyle(fontFamily: 'Courier', fontSize: 12, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
              ]),
            )),
            const SizedBox(width: 8),
            IconButton(
              icon: scanning
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.qr_code_scanner),
              onPressed: scanning ? null : () async {
                setSt(() => scanning = true);
                try {
                  final scanned = await Navigator.of(ctx).push<String>(
                    MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
                  );
                  if (scanned != null && scanned.isNotEmpty) setSt(() => barcode = scanned);
                } finally {
                  if (ctx.mounted) setSt(() => scanning = false);
                }
              },
            ),
          ]),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l10n.cancel)),
          FilledButton.icon(
            icon: const Icon(Icons.build, size: 16),
            label: Text(l10n.warehouseSendToRepair),
            onPressed: () async {
              // Save supplier to cache
              if (supplierCtrl.text.isNotEmpty) FieldCacheService.instance.save('repair.supplier', supplierCtrl.text);
              await widget.svc.sendToRepair(
                widget.item.id,
                supplierName:  supplierCtrl.text.isNotEmpty ? supplierCtrl.text : null,
                supplierPhone: phoneCtrl.text.isNotEmpty   ? phoneCtrl.text   : null,
                supplierEmail: emailCtrl.text.isNotEmpty   ? emailCtrl.text   : null,
                reason:        reasonCtrl.text.isNotEmpty  ? reasonCtrl.text  : null,
                barcode:       barcode,
              );
              if (ctx.mounted) Navigator.pop(ctx);
              widget.onRefresh();
            },
          ),
        ],
      )),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final item = widget.item;
    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (_, ctrl) => Column(children: [
        const SizedBox(height: 8),
        Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 12),

        // Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(item.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 20)),
              if (item.category != null) Text(item.category!.name, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
            ])),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('${item.quantity}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 32, color: item.quantity == 0 ? Colors.red : AppColors.primary)),
              if (item.unit != null) Text(item.unit!, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
            ]),
          ]),
        ),
        const SizedBox(height: 12),

        // Info rows
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (item.location != null) _InfoRow(icon: Icons.location_on_outlined, text: item.location!),
            if (item.description != null) _InfoRow(icon: Icons.notes_outlined, text: item.description!),
            _InfoRow(icon: Icons.qr_code_2, text: item.barcode),
          ]),
        ),
        const SizedBox(height: 12),

        // Stock buttons
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            Expanded(child: OutlinedButton.icon(
              onPressed: () => _addTx('in'),
              icon: const Icon(Icons.add, size: 18),
              label: Text(l10n.warehouseIn),
              style: OutlinedButton.styleFrom(foregroundColor: Colors.green),
            )),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton.icon(
              onPressed: () => _addTx('out'),
              icon: const Icon(Icons.remove, size: 18),
              label: Text(l10n.warehouseOut),
              style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
            )),
          ]),
        ),
        const SizedBox(height: 8),

        // Repair button
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: OutlinedButton.icon(
            onPressed: () => _showRepairDialog(context, l10n),
            icon: const Icon(Icons.build_outlined, size: 18),
            label: Text(item.repairStatus == 'in_repair' ? '🔧 ${l10n.warehouseInRepair}' : l10n.warehouseSendToRepair),
            style: OutlinedButton.styleFrom(
              foregroundColor: item.repairStatus == 'in_repair' ? Colors.orange : AppColors.primary,
              minimumSize: const Size(double.infinity, 40),
            ),
          ),
        ),

        // Active repair info banner
        if (item.repairStatus == 'in_repair')
          FutureBuilder<List<Map<String, dynamic>>>(
            future: widget.svc.getItemRepairs(item.id),
            builder: (_, snap) {
              if (!snap.hasData || snap.data!.isEmpty) return const SizedBox();
              final repair = snap.data!.first;
              return Container(
                margin: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.withOpacity(0.4)),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Icon(Icons.build_circle_outlined, size: 16, color: Colors.orange),
                    const SizedBox(width: 6),
                    Text(l10n.warehouseInRepair, style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.orange, fontSize: 13)),
                    const Spacer(),
                    TextButton(
                      onPressed: () async {
                        await widget.svc.returnFromRepair(repair['id'] as int);
                        widget.onRefresh();
                        if (context.mounted) Navigator.pop(context);
                      },
                      style: TextButton.styleFrom(foregroundColor: Colors.green, padding: EdgeInsets.zero),
                      child: const Text('✓ Returned', style: TextStyle(fontSize: 12)),
                    ),
                  ]),
                  if (repair['supplierName'] != null)
                    Text('${l10n.warehouseSupplier}: ${repair['supplierName']}', style: const TextStyle(fontSize: 12)),
                  if (repair['reason'] != null)
                    Text('${l10n.warehouseReason}: ${repair['reason']}', style: const TextStyle(fontSize: 12)),
                  if (repair['sentAt'] != null)
                    Text('${l10n.warehouseSentAt}: ${(repair['sentAt'] as String).substring(0, 10)}', style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
                ]),
              );
            },
          ),

        const Divider(height: 24),

        // Same-name items list
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            Text('${item.name} — all units', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const Spacer(),
            if (_loading) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
          ]),
        ),
        const SizedBox(height: 6),
        Expanded(
          child: _sameNameItems.isEmpty
              ? const SizedBox()
              : ListView.separated(
                  controller: ctrl,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  itemCount: _sameNameItems.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final si = _sameNameItems[i];
                    final isCurrent = si.id == item.id;
                    return ListTile(
                      dense: true,
                      tileColor: isCurrent ? AppColors.primary.withOpacity(0.06) : null,
                      leading: Icon(
                        Icons.qr_code_2,
                        size: 18,
                        color: isCurrent ? AppColors.primary : AppColors.inkSoft,
                      ),
                      title: Text(
                        si.barcode,
                        style: TextStyle(
                          fontFamily: 'Courier',
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: isCurrent ? AppColors.primary : AppColors.inkSoft,
                        ),
                      ),
                      subtitle: si.location != null ? Text(si.location!, style: const TextStyle(fontSize: 11)) : null,
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Text('${si.quantity}', style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 18,
                          color: si.quantity == 0 ? Colors.red : Colors.green,
                        )),
                        if (si.unit != null) Text(si.unit!, style: const TextStyle(fontSize: 9, color: AppColors.inkSoft)),
                      ]),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(children: [
      Icon(icon, size: 16, color: AppColors.inkSoft),
      const SizedBox(width: 8),
      Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
    ]),
  );
}

// ─── Category chip ────────────────────────────────────────────────────────────

class _CatChip extends StatelessWidget {
  const _CatChip({required this.label, required this.selected, required this.onTap});
  final String label; final bool selected; final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: FilterChip(label: Text(label, style: const TextStyle(fontSize: 12)), selected: selected, onSelected: (_) => onTap()),
  );
}

// ─── Barcode visual (CSS-like bars) ──────────────────────────────────────────

class _BarcodeVisual extends StatelessWidget {
  const _BarcodeVisual({required this.data});
  final String data;
  @override
  Widget build(BuildContext context) {
    // Simple deterministic pattern from data characters for visual hint
    final pattern = data.runes.expand((r) {
      final bits = r.toRadixString(2).padLeft(8, '0');
      return bits.split('').map((b) => b == '1');
    }).toList();
    return SizedBox(
      height: 36, width: 160,
      child: Row(
        children: List.generate(40, (i) {
          final isBar = pattern[i % pattern.length];
          return Expanded(child: Container(
            color: isBar ? Colors.black : Colors.white,
            height: 36,
          ));
        }),
      ),
    );
  }
}
