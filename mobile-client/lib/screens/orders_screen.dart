import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/order_service.dart';
import '../widgets/media_thumbnail.dart';
import 'scan_review_screen.dart';
import 'order_detail_screen.dart';

/// Purchase orders, whether captured automatically from the dedicated
/// order-intake inbox (see the server's GmailOrderPollerService) or
/// uploaded manually here the same way documents are elsewhere in the
/// app — camera/gallery/file -> crop & filter -> PDF.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<OrderListItem>? _orders;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final orders = await context.read<OrderService>().list();
      if (!mounted) return;
      setState(() { _orders = orders; _error = null; });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e is Exception ? e.toString() : 'Failed to load orders');
    }
  }

  Future<void> _uploadFromScan(File imageFile) async {
    final bytes = await Navigator.of(context).push<Uint8List>(
      MaterialPageRoute(
        builder: (_) => ScanReviewScreen(
          imageFile: imageFile,
          place: '',
          docType: 'document',
          mode: ScanReviewMode.returnBytes,
        ),
      ),
    );
    if (bytes == null || !mounted) return;
    await _uploadBytes(bytes);
  }

  Future<void> _uploadBytes(Uint8List bytes) async {
    final l10n = AppLocalizations.of(context)!;
    setState(() => _uploading = true);
    try {
      final tmpDir = Directory.systemTemp;
      final tmpFile = await File('${tmpDir.path}/order_${DateTime.now().millisecondsSinceEpoch}.pdf').create(recursive: true);
      await tmpFile.writeAsBytes(bytes);
      await context.read<OrderService>().createManual(tmpFile);
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.orderUploadError)));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _pickFromCamera() async {
    final photo = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 90);
    if (photo == null || !mounted) return;
    await _uploadFromScan(File(photo.path));
  }

  Future<void> _pickFromGallery() async {
    final photo = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (photo == null || !mounted) return;
    await _uploadFromScan(File(photo.path));
  }

  Future<void> _pickFromFiles() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf']);
    final path = result?.files.single.path;
    if (path == null || !mounted) return;
    final bytes = await File(path).readAsBytes();
    await _uploadBytes(bytes);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.camera_alt_outlined, size: 18),
                  label: Text(l10n.sourceCamera, overflow: TextOverflow.ellipsis),
                  onPressed: _uploading ? null : _pickFromCamera,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                  label: Text(l10n.calendarGallery, overflow: TextOverflow.ellipsis),
                  onPressed: _uploading ? null : _pickFromGallery,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.folder_open_outlined, size: 18),
                  label: Text(l10n.sourceFiles, overflow: TextOverflow.ellipsis),
                  onPressed: _uploading ? null : _pickFromFiles,
                ),
              ),
            ],
          ),
        ),
        if (_uploading) const LinearProgressIndicator(minHeight: 2),
        Expanded(child: _buildList(l10n)),
      ],
    );
  }

  Widget _buildList(AppLocalizations l10n) {
    if (_error != null) {
      return Center(child: Text(_error!, style: const TextStyle(color: AppColors.inkSoft)));
    }
    if (_orders == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_orders!.isEmpty) {
      return Center(child: Text(l10n.ordersEmpty, style: const TextStyle(color: AppColors.inkSoft)));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        itemCount: _orders!.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) {
          final order = _orders![i];
          return ListTile(
            leading: MediaThumbnail.pdf(url: '/orders/${order.id}/pdf'),
            title: Text(order.generatedName, maxLines: 2, overflow: TextOverflow.ellipsis),
            subtitle: Text(order.completed ? l10n.orderStatusCompleted : l10n.orderStatusPending),
            trailing: Icon(
              order.completed ? Icons.check_circle : Icons.hourglass_empty,
              color: order.completed ? Colors.green : AppColors.inkSoft,
              size: 20,
            ),
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: order.id)),
              );
              _load();
            },
          );
        },
      ),
    );
  }
}
