import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/file_service.dart';
import '../services/locations_service.dart';
import '../models/location.dart' as loc;
import '../store/app_state.dart';
import 'camera_screen.dart';
import 'history_screen.dart';
import 'settings_screen.dart';
import '../widgets/search_picker_field.dart';
import '../widgets/org_switcher_bar.dart';
import 'document_preview_screen.dart';
import 'scan_batch_flow.dart';

/// Everything that existed before the Calls feature (upload / history /
/// settings) now lives together under the "Переучет" (Inventory) tab —
/// see RootScreen for the outer navigation between this and Calls.
class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> with SingleTickerProviderStateMixin {
  final _placeController = TextEditingController();
  String _docType = 'document'; // 'document' | 'photo'
  List<File> _selectedFiles = [];
  bool _uploading = false;
  String? _statusMessage;
  bool _statusIsError = false;
  late final TabController _tabController;
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        setState(() => _tabIndex = _tabController.index);
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _openCamera() async {
    final result = await Navigator.of(context).push<List<File>>(
      MaterialPageRoute(builder: (_) => const CameraScreen()),
    );
    if (result == null || result.isEmpty) return;

    if (_docType == 'document') {
      // A document scan combines everything captured in this one camera
      // session into a single (possibly multi-page) file, rather than
      // sitting in the picker as separate pending files the way a photo
      // selection would — see runScanBatchFlow.
      final l10n = AppLocalizations.of(context)!;
      if (_placeController.text.trim().isEmpty) {
        setState(() { _statusMessage = l10n.uploadMissingFields; _statusIsError = true; });
        return;
      }
      FocusScope.of(context).unfocus();
      SystemChannels.textInput.invokeMethod('TextInput.hide');
      await Future.delayed(const Duration(milliseconds: 150));
      await _scanAndUpload(result);
      return;
    }

    setState(() => _selectedFiles = [..._selectedFiles, ...result]);
  }

  Future<void> _scanAndUpload(List<File> photos) async {
    if (!mounted) return;
    final l10n = AppLocalizations.of(context)!;
    final place = _placeController.text.trim();
    final fileService = context.read<FileService>();

    final result = await runScanBatchFlow(context, photos: photos, place: place, docType: 'document');
    if (!mounted || result == null) return;

    setState(() { _statusMessage = l10n.uploadSuccess; _statusIsError = false; });
    _placeController.clear();

    final id = result['id'] as int?;
    final name = result['generatedName'] as String? ?? 'document.pdf';
    if (id != null) {
      try {
        final bytes = await fileService.downloadFile(id);
        if (!mounted) return;
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => DocumentPreviewScreen(pdfBytes: bytes, filename: name),
        ));
      } catch (_) {
        // The document was already saved successfully — a preview-fetch
        // hiccup here shouldn't be reported as a failure.
      }
    }
  }

  Future<void> _pickFromFiles(FileService fileService) async {
    final files = await fileService.pickFromFileManager();
    if (files.isNotEmpty) setState(() => _selectedFiles = files);
  }

  /// Photos and screenshots picked straight from the phone's photo
  /// library — added to the pending list the same way file-manager
  /// picks are (processed on "Upload", same document/photo handling
  /// either way based on _docType).
  Future<void> _pickFromGallery() async {
    final picked = await ImagePicker().pickMultiImage(imageQuality: 90);
    if (picked.isEmpty) return;
    setState(() => _selectedFiles = [..._selectedFiles, ...picked.map((x) => File(x.path))]);
  }

  Future<void> _upload(FileService fileService) async {
    final l10n = AppLocalizations.of(context)!;
    if (_selectedFiles.isEmpty || _placeController.text.trim().isEmpty) {
      // Was a silent no-op before — tapping Upload with a required field
      // empty looked exactly like a broken button (nothing visibly
      // happened). Surface why instead of failing silently.
      setState(() {
        _statusMessage = l10n.uploadMissingFields;
        _statusIsError = true;
      });
      return;
    }

    // Documents go through the interactive review screen (auto-detect ->
    // drag corners / pick a filter / adjust brightness+contrast / toggle
    // shadow removal, previewing each change -> optionally combine
    // multiple pages into one document with a custom name -> confirm) —
    // but only for actual photos; an already-finished PDF picked from
    // the file manager has nothing to crop or filter, so it skips
    // straight to direct upload like before. Whether the photos came
    // from the camera or were picked from the file manager/gallery goes
    // through the exact same batch flow either way.
    if (_docType == 'document') {
      final pdfFiles = _selectedFiles.where((f) => f.path.toLowerCase().endsWith('.pdf')).toList();
      final imageFiles = _selectedFiles.where((f) => !f.path.toLowerCase().endsWith('.pdf')).toList();
      setState(() => _selectedFiles = []);

      if (imageFiles.isNotEmpty) {
        if (_placeController.text.trim().isEmpty) {
          setState(() { _statusMessage = l10n.uploadMissingFields; _statusIsError = true; });
          return;
        }
        FocusScope.of(context).unfocus();
        SystemChannels.textInput.invokeMethod('TextInput.hide');
        await Future.delayed(const Duration(milliseconds: 150));
        await _scanAndUpload(imageFiles);
      }

      var anySucceeded = false;
      if (pdfFiles.isNotEmpty) {
        anySucceeded = await _uploadDirectly(fileService, pdfFiles) || anySucceeded;
        if (!mounted) return;
        setState(() {
          _statusMessage = anySucceeded ? l10n.uploadSuccess : _statusMessage;
          _statusIsError = false;
        });
        if (anySucceeded) _placeController.clear();
      }
      return;
    }

    setState(() { _uploading = true; _statusMessage = l10n.uploadInProgress; _statusIsError = false; });
    try {
      await fileService.uploadBatch(
        place: _placeController.text.trim(),
        docType: _docType,
        files: _selectedFiles,
      );
      setState(() { _statusMessage = l10n.uploadSuccess; _selectedFiles = []; _statusIsError = false; });
      _placeController.clear();
    } catch (_) {
      setState(() { _statusMessage = l10n.uploadError; _statusIsError = true; });
    } finally {
      setState(() => _uploading = false);
    }
  }

  /// Returns true if at least one file was successfully saved.
  /// Already-finished PDFs picked from the file manager — nothing to
  /// crop or filter, so straight to storage like the pre-review flow.
  Future<bool> _uploadDirectly(FileService fileService, List<File> files) async {
    try {
      final results = await fileService.uploadBatch(
        place: _placeController.text.trim(),
        docType: 'document',
        files: files,
      );
      if (!mounted) return results.isNotEmpty;
      for (final r in results) {
        final map = r as Map<String, dynamic>;
        final id = map['id'] as int?;
        final name = map['generatedName'] as String? ?? 'document.pdf';
        if (id == null) continue;
        try {
          final bytes = await fileService.downloadFile(id);
          if (!mounted) return true;
          await Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => DocumentPreviewScreen(pdfBytes: bytes, filename: name),
          ));
        } catch (_) {
          // Upload itself already succeeded — a preview-fetch hiccup
          // shouldn't be reported as an upload failure.
        }
      }
      return results.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final appState = context.watch<AppState>();
    final fileService = context.read<FileService>();

    final body = _tabIndex == 0
        ? _buildCaptureTab(l10n, fileService)
        : const HistoryScreen();

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(l10n.inventoryTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: l10n.navSettings,
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => SettingsScreen(appState: appState)),
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(icon: const Icon(Icons.cloud_upload_outlined, size: 20), text: l10n.navScanner),
            Tab(icon: const Icon(Icons.history_outlined, size: 20), text: l10n.navHistory),
          ],
        ),
      ),
      body: body,
    );
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text, style: const TextStyle(
          fontSize: 11.5, fontWeight: FontWeight.w600, letterSpacing: 0.4,
          color: AppColors.inkSoft,
        )),
      );

  Widget _buildCaptureTab(AppLocalizations l10n, FileService fileService) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const OrgSwitcherBar(),
                  _sectionLabel(l10n.place.toUpperCase()),
                  SearchPickerField<loc.Location>(
                    controller: _placeController,
                    hintText: l10n.placeHint,
                    search: (q) => context.read<LocationsService>().searchLocations(q),
                    displayString: (l) => l.name,
                    listLabel: (l) => l.city != null ? '${l.name} (${l.city!.name})' : l.name,
                    onSelected: (l) {},
                  ),
                  const SizedBox(height: 18),
                  _sectionLabel(l10n.docType.toUpperCase()),
                  SegmentedButton<String>(
                    segments: [
                      ButtonSegment(value: 'document', label: Text(l10n.docTypeDocument), icon: const Icon(Icons.description_outlined, size: 16)),
                      ButtonSegment(value: 'photo', label: Text(l10n.docTypePhoto), icon: const Icon(Icons.image_outlined, size: 16)),
                    ],
                    selected: {_docType},
                    onSelectionChanged: (s) => setState(() => _docType = s.first),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.camera_alt_outlined, size: 18),
                          label: Text(l10n.sourceCamera, overflow: TextOverflow.ellipsis),
                          onPressed: _openCamera,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.photo_library_outlined, size: 18),
                          label: Text(l10n.calendarGallery, overflow: TextOverflow.ellipsis),
                          onPressed: _pickFromGallery,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.folder_open_outlined, size: 18),
                          label: Text(l10n.sourceFiles, overflow: TextOverflow.ellipsis),
                          onPressed: () => _pickFromFiles(fileService),
                        ),
                      ),
                    ],
                  ),
                  if (_selectedFiles.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      decoration: BoxDecoration(
                        color: AppColors.primaryWash,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(children: [
                        const Icon(Icons.check_circle_outline, size: 16, color: AppColors.primary),
                        const SizedBox(width: 8),
                        Text(l10n.selectedFilesCount(_selectedFiles.length),
                            style: const TextStyle(color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.w600)),
                      ]),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_statusMessage != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: _statusIsError ? AppColors.stampWash : const Color(0xFFE6EFE9),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(children: [
                Icon(_statusIsError ? Icons.error_outline : Icons.check_circle_outline, size: 16,
                    color: _statusIsError ? AppColors.stamp : AppColors.success),
                const SizedBox(width: 8),
                Expanded(child: Text(_statusMessage!, style: TextStyle(
                  color: _statusIsError ? AppColors.stamp : AppColors.success, fontSize: 13,
                ))),
              ]),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            icon: _uploading
                ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.upload_outlined, size: 18),
            label: Text(_uploading ? l10n.uploadInProgress : l10n.uploadButton),
            onPressed: _uploading ? null : () => _upload(fileService),
          ),
        ],
      ),
    );
  }
}
