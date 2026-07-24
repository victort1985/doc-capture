import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/order_service.dart';
import '../services/delivery_notes_service.dart';
import 'delivery_note_form_screen.dart';
import 'scan_review_screen.dart';
import '../services/quotes_service.dart';
import '../widgets/search_picker_field.dart';

/// One order's detail: the PO itself (page 1), plus — once a delivery
/// note has been added — that as page 2+. The same camera/gallery/file
/// buttons used everywhere else in the app capture the delivery note;
/// adding it asks for its number first (to replace the "0000"
/// placeholder in the stored filename) and immediately combines +
/// completes the order — there's no separate half-done state to leave
/// hanging. Sharing/printing is the same PdfPreview widget used for a
/// freshly-scanned document elsewhere in the app, which already has
/// both built in.
class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId, this.order});

  final int orderId;
  final OrderListItem? order;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Uint8List? _pdfBytes;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPdf();
  }

  Future<void> _loadPdf() async {
    try {
      final bytes = await context.read<OrderService>().downloadPdf(widget.orderId);
      if (!mounted) return;
      setState(() { _pdfBytes = bytes; _error = null; });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Failed to load');
    }
  }

  /// Resolves this order's chain (assigning it one if it never had one)
  /// so the delivery note created next joins the same chain, then
  /// opens the delivery note form pre-filled with the ordering
  /// organization's name — the actual "next link" the whole chain
  /// feature is for.
  Future<void> _createDeliveryNote() async {
    String? chainId;
    try {
      final chain = await context.read<ApiService>().get('/order-chain/for/order/${widget.orderId}');
      chainId = chain['chainId'] as String?;
    } catch (_) {
      // Non-fatal — the note still gets created, just without a
      // resolved chain link if this call fails for some reason.
    }
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => DeliveryNoteFormScreen(
        svc: DeliveryNotesService(context.read<ApiService>()),
        prefillClientName: widget.order?.organization,
        prefillChainId: chainId,
      ),
    ));
  }

  List<Quote>? _quotesCache;

  Future<List<Quote>> _searchQuotes(String query) async {
    _quotesCache ??= await QuotesService(context.read<ApiService>()).list();
    final q = query.toLowerCase();
    return _quotesCache!
        .where((quote) =>
            (quote.quoteNumber ?? '#${quote.id}').toLowerCase().contains(q) ||
            quote.clientName.toLowerCase().contains(q))
        .toList();
  }

  /// Manually links this order into an existing quote's chain — for
  /// when the order was received separately (e.g. by email) from a
  /// quote already created for the same client, rather than the two
  /// only ever connecting via "create new X from Y" at creation time.
  Future<void> _linkToQuote() async {
    final l10n = AppLocalizations.of(context)!;
    final picked = await showModalBottomSheet<Quote>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.linkToQuoteTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 4),
            Text(l10n.invoiceFromQuotePickHint, style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft)),
            const SizedBox(height: 12),
            SearchPickerField<Quote>(
              search: _searchQuotes,
              displayString: (q) => q.quoteNumber ?? '#${q.id}',
              listLabel: (q) => '${q.quoteNumber ?? '#${q.id}'} · ${q.clientName}',
              hintText: l10n.invoiceFromQuoteSearchHint,
              onSelected: (q) => Navigator.of(ctx).pop(q),
            ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    try {
      await context.read<ApiService>().post('/order-chain/link', {
        'sourceType': 'order', 'sourceId': widget.orderId,
        'targetType': 'quote', 'targetId': picked.id,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.linkedSuccessfully)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<(String, String)?> _askInvoiceNumber() {
    final l10n = AppLocalizations.of(context)!;
    final numberController = TextEditingController();
    final descController = TextEditingController();
    return showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.orderInvoiceNumberPrompt),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: numberController,
              autofocus: true,
              keyboardType: TextInputType.text,
              decoration: InputDecoration(hintText: l10n.orderInvoiceNumberHint),
            ),
            TextField(
              controller: descController,
              keyboardType: TextInputType.text,
              decoration: InputDecoration(hintText: l10n.orderInvoiceDescriptionHint),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(null), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () {
              final number = numberController.text.trim();
              if (number.isEmpty) return;
              Navigator.of(dialogContext).pop((number, descController.text.trim()));
            },
            child: Text(l10n.orderMarkDone),
          ),
        ],
      ),
    );
  }

  Future<void> _addInvoiceFromScan(File imageFile) async {
    final pageBytes = await Navigator.of(context).push<Uint8List>(
      MaterialPageRoute(
        builder: (_) => ScanReviewScreen(
          imageFile: imageFile,
          place: '',
          docType: 'document',
          mode: ScanReviewMode.returnBytes,
        ),
      ),
    );
    if (pageBytes == null || !mounted) return;
    await _completeWithBytes(pageBytes);
  }

  Future<void> _completeWithBytes(Uint8List bytes) async {
    if (!mounted) return;
    final result = await _askInvoiceNumber();
    if (result == null || !mounted) return;
    final (invoiceNumber, description) = result;

    final l10n = AppLocalizations.of(context)!;
    setState(() => _busy = true);
    try {
      await context.read<OrderService>().addInvoice(widget.orderId, invoiceNumber, bytes, description: description);
      if (!mounted) return;
      await _loadPdf();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.orderCompleteError)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickFromCamera() async {
    final photo = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 90);
    if (photo == null || !mounted) return;
    await _addInvoiceFromScan(File(photo.path));
  }

  Future<void> _pickFromGallery() async {
    final photo = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (photo == null || !mounted) return;
    await _addInvoiceFromScan(File(photo.path));
  }

  Future<void> _pickFromFiles() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf']);
    final path = result?.files.single.path;
    if (path == null || !mounted) return;
    final bytes = await File(path).readAsBytes();
    await _completeWithBytes(bytes);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ordersTitle)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.camera_alt_outlined, size: 18),
                    label: Text(l10n.sourceCamera, overflow: TextOverflow.ellipsis),
                    onPressed: _busy ? null : _pickFromCamera,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.photo_library_outlined, size: 18),
                    label: Text(l10n.calendarGallery, overflow: TextOverflow.ellipsis),
                    onPressed: _busy ? null : _pickFromGallery,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.folder_open_outlined, size: 18),
                    label: Text(l10n.sourceFiles, overflow: TextOverflow.ellipsis),
                    onPressed: _busy ? null : _pickFromFiles,
                  ),
                ),
              ],
            ),
          ),
          if (_busy) const LinearProgressIndicator(minHeight: 2),
          Expanded(child: _buildPreview()),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              OutlinedButton.icon(
                onPressed: _linkToQuote,
                icon: const Icon(Icons.link, size: 18),
                label: Text(l10n.linkToQuoteButton),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _createDeliveryNote,
                icon: const Icon(Icons.local_shipping_outlined, size: 18),
                label: Text(l10n.orderCreateDeliveryNote),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPreview() {
    if (_error != null) return Center(child: Text(_error!));
    if (_pdfBytes == null) return const Center(child: CircularProgressIndicator());
    // PdfPreview already has share + print built in (useActions: true) —
    // the same widget used right after scanning a fresh document
    // elsewhere in the app.
    return PdfPreview(
      build: (format) async => _pdfBytes!,
      canDebug: false,
      allowPrinting: true,
      allowSharing: true,
      useActions: true,
    );
  }
}
