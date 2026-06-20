import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/file_service.dart';
import '../store/app_state.dart';
import 'camera_screen.dart';
import 'history_screen.dart';
import 'settings_screen.dart';

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
    _tabController = TabController(length: 3, vsync: this);
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
    if (result != null && result.isNotEmpty) {
      setState(() => _selectedFiles = [..._selectedFiles, ...result]);
    }
  }

  Future<void> _pickFromFiles(FileService fileService) async {
    final files = await fileService.pickFromFileManager();
    if (files.isNotEmpty) setState(() => _selectedFiles = files);
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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final appState = context.watch<AppState>();
    final fileService = context.read<FileService>();

    final body = _tabIndex == 0
        ? _buildCaptureTab(l10n, fileService)
        : _tabIndex == 1
            ? const HistoryScreen()
            : SettingsScreen(appState: appState);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.inventoryTitle),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(icon: const Icon(Icons.cloud_upload_outlined, size: 20), text: l10n.navHome),
            Tab(icon: const Icon(Icons.history_outlined, size: 20), text: l10n.navHistory),
            Tab(icon: const Icon(Icons.settings_outlined, size: 20), text: l10n.navSettings),
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
                  _sectionLabel(l10n.place.toUpperCase()),
                  TextField(
                    controller: _placeController,
                    decoration: InputDecoration(hintText: l10n.placeHint, prefixIcon: const Icon(Icons.storefront_outlined, size: 20)),
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
                          icon: const Icon(Icons.camera_alt_outlined, size: 19),
                          label: Text(l10n.sourceCamera),
                          onPressed: _openCamera,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.folder_open_outlined, size: 19),
                          label: Text(l10n.sourceFiles),
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
