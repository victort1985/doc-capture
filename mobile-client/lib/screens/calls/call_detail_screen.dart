import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../app/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../models/service_call.dart';
import '../../services/calls_service.dart';
import '../../services/file_service.dart';
import '../../services/api_service.dart';
import '../../widgets/callable_text.dart';
import '../../widgets/elapsed_timer_text.dart';
import '../camera_screen.dart';

class CallDetailScreen extends StatefulWidget {
  const CallDetailScreen({super.key, required this.callId});
  final int callId;

  @override
  State<CallDetailScreen> createState() => _CallDetailScreenState();
}

class _CallDetailScreenState extends State<CallDetailScreen> {
  late Future<CallDetail> _future;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() => setState(() => _future = context.read<CallsService>().getOne(widget.callId));

  Future<void> _changeStatus(CallStatus status) async {
    setState(() => _busy = true);
    try {
      await context.read<CallsService>().updateStatus(widget.callId, status);
      _reload();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addTextNote() async {
    final l10n = AppLocalizations.of(context)!;
    final controller = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(l10n.callAddNote),
        content: TextField(controller: controller, maxLines: 3, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text), child: Text(l10n.save)),
        ],
      ),
    );
    if (text == null || text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await context.read<CallsService>().addNote(widget.callId, text: text.trim());
      _reload();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addPhotoNote() async {
    final result = await Navigator.of(context).push<List<File>>(
      MaterialPageRoute(builder: (_) => const CameraScreen()),
    );
    if (result == null || result.isEmpty) return;
    setState(() => _busy = true);
    try {
      await context.read<CallsService>().addNote(widget.callId, photo: result.first);
      _reload();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _uploadFromCamera() async {
    final result = await Navigator.of(context).push<List<File>>(
      MaterialPageRoute(builder: (_) => const CameraScreen()),
    );
    if (result == null || result.isEmpty) return;
    await _uploadFiles(result);
  }

  Future<void> _uploadFromFiles() async {
    final files = await context.read<FileService>().pickFromFileManager();
    if (files.isEmpty) return;
    await _uploadFiles(files);
  }

  Future<void> _uploadFiles(List<File> files) async {
    setState(() => _busy = true);
    try {
      for (final f in files) {
        await context.read<CallsService>().addAttachment(widget.callId, f);
      }
      _reload();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showAddFileOptions() {
    final l10n = AppLocalizations.of(context)!;
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Wrap(children: [
          ListTile(
            leading: const Icon(Icons.camera_alt_outlined),
            title: Text(l10n.sourceCamera),
            onTap: () { Navigator.pop(context); _uploadFromCamera(); },
          ),
          ListTile(
            leading: const Icon(Icons.folder_open_outlined),
            title: Text(l10n.sourceFiles),
            onTap: () { Navigator.pop(context); _uploadFromFiles(); },
          ),
        ]),
      ),
    );
  }

  Color _statusColor(CallStatus s) {
    switch (s) {
      case CallStatus.open:
        return AppColors.stamp;
      case CallStatus.inProgress:
        return const Color(0xFFB8860B);
      case CallStatus.closed:
        return AppColors.success;
    }
  }

  String _statusLabel(AppLocalizations l10n, CallStatus s) {
    switch (s) {
      case CallStatus.open:
        return l10n.callStatusOpen;
      case CallStatus.inProgress:
        return l10n.callStatusInProgress;
      case CallStatus.closed:
        return l10n.callStatusClosed;
    }
  }

  Future<void> _viewNotePhoto(int noteId) async {
    try {
      final bytes = await context.read<ApiService>().getBytes('/calls/notes/$noteId/photo');
      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (_) => Dialog(
          insetPadding: const EdgeInsets.all(12),
          child: InteractiveViewer(child: Image.memory(bytes)),
        ),
      );
    } catch (_) {
      if (mounted) _showSnack(AppLocalizations.of(context)!.callViewFileError);
    }
  }

  /// Best-effort: downloads the attachment, writes it to a temp file, and
  /// asks the OS to open it with whatever app handles PDFs. No PDF viewer
  /// is bundled in-app — if no app on the device is registered to open
  /// PDFs (rare but possible), this surfaces an error rather than
  /// silently doing nothing.
  Future<void> _viewAttachment(int attachmentId, String filename) async {
    try {
      final bytes = await context.read<ApiService>().getBytes('/calls/attachments/$attachmentId/download');
      final tmp = await File('${Directory.systemTemp.path}/$filename').create(recursive: true);
      await tmp.writeAsBytes(bytes);
      final opened = await launchUrl(Uri.file(tmp.path), mode: LaunchMode.externalApplication);
      if (!opened && mounted) _showSnack(AppLocalizations.of(context)!.callViewFileError);
    } catch (_) {
      if (mounted) _showSnack(AppLocalizations.of(context)!.callViewFileError);
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Widget _infoRow(String label, String value, {bool callable = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 110, child: Text(label, style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5))),
          Expanded(
            child: callable
                ? CallableText(value, style: const TextStyle(fontSize: 13.5))
                : Text(value, style: const TextStyle(fontSize: 13.5)),
          ),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.callDetailsTitle)),
      body: SafeArea(
        child: FutureBuilder<CallDetail>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(child: Text(l10n.callsLoadError));
            }
            final detail = snapshot.data!;
            final call = detail.call;

            return Stack(children: [
              ListView(
                padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(call.place, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: _statusColor(call.status).withOpacity(0.12),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(_statusLabel(l10n, call.status),
                                style: TextStyle(color: _statusColor(call.status), fontSize: 11.5, fontWeight: FontWeight.w600)),
                          ),
                        ]),
                        const SizedBox(height: 6),
                        Row(children: [
                          const Icon(Icons.timer_outlined, size: 14, color: Colors.red),
                          const SizedBox(width: 4),
                          ElapsedTimerText(
                            start: call.createdAt,
                            end: call.status == CallStatus.closed ? call.statusChangedAt : null,
                            style: const TextStyle(fontSize: 12.5, color: Colors.red, fontWeight: FontWeight.w600),
                          ),
                        ]),
                        if (call.workingSessions.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Wrap(spacing: 12, runSpacing: 4, children: call.workingSessions.map((s) => Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.person_outline, size: 13, color: AppColors.inkSoft),
                              const SizedBox(width: 3),
                              Text('${s.userName}: ', style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
                              ElapsedTimerText(
                                start: s.startedAt,
                                end: s.endedAt,
                                style: const TextStyle(fontSize: 12, color: AppColors.inkSoft, fontWeight: FontWeight.w600),
                              ),
                            ],
                          )).toList()),
                        ],
                        const SizedBox(height: 10),
                        _infoRow(l10n.callContactName, call.contactName),
                        _infoRow(l10n.callContactPosition, call.contactPosition),
                        _infoRow(l10n.callContactPhone, call.contactPhone, callable: true),
                        _infoRow(l10n.callUrgency, call.urgency == CallUrgency.urgent ? l10n.callUrgent : l10n.callNotUrgent),
                        if (call.unusualDamage) _infoRow(l10n.callUnusualDamage, '✓'),
                        const SizedBox(height: 8),
                        Text(call.description, style: const TextStyle(fontSize: 13.5)),
                        if (call.statusChangedByUsername != null) ...[
                          const SizedBox(height: 10),
                          Text(
                            l10n.callStatusChangedBy(call.statusChangedByUsername!),
                            style: const TextStyle(color: AppColors.inkSoft, fontSize: 11.5),
                          ),
                        ],
                      ]),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    if (call.status != CallStatus.open)
                      OutlinedButton(onPressed: () => _changeStatus(CallStatus.open), child: Text(l10n.callStatusOpen)),
                    if (call.status != CallStatus.inProgress)
                      OutlinedButton(onPressed: () => _changeStatus(CallStatus.inProgress), child: Text(l10n.callStatusInProgress)),
                    if (call.status != CallStatus.closed)
                      FilledButton(onPressed: () => _changeStatus(CallStatus.closed), child: Text(l10n.callStatusClosed)),
                  ]),
                  const SizedBox(height: 20),
                  Row(children: [
                    Expanded(child: Text(l10n.callNotes, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5))),
                    PopupMenuButton<String>(
                      icon: const Icon(Icons.add_comment_outlined),
                      onSelected: (v) => v == 'text' ? _addTextNote() : _addPhotoNote(),
                      itemBuilder: (_) => [
                        PopupMenuItem(value: 'text', child: Text(l10n.callAddNote)),
                        PopupMenuItem(value: 'photo', child: Text(l10n.callAddPhotoNote)),
                      ],
                    ),
                  ]),
                  if (detail.notes.isEmpty) Text(l10n.callNoNotes, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
                  ...detail.notes.map((n) => Card(
                        child: ListTile(
                          leading: Icon(n.hasPhoto ? Icons.image_outlined : Icons.notes_outlined, size: 20),
                          title: Text(n.text ?? l10n.callPhotoNote),
                          subtitle: Text(n.authorUsername, style: const TextStyle(fontSize: 11.5)),
                          trailing: n.hasPhoto ? const Icon(Icons.visibility_outlined, size: 18) : null,
                          onTap: n.hasPhoto ? () => _viewNotePhoto(n.id) : null,
                        ),
                      )),
                  const SizedBox(height: 20),
                  Row(children: [
                    Expanded(child: Text(l10n.callAttachments, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5))),
                    IconButton(icon: const Icon(Icons.attach_file), onPressed: _showAddFileOptions),
                  ]),
                  if (detail.attachments.isEmpty) Text(l10n.callNoAttachments, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
                  ...detail.attachments.map((a) => Card(
                        child: ListTile(
                          leading: const Icon(Icons.picture_as_pdf_outlined, size: 20),
                          title: Text(a.originalName),
                          subtitle: Text(a.uploadedByUsername, style: const TextStyle(fontSize: 11.5)),
                          trailing: const Icon(Icons.visibility_outlined, size: 18),
                          onTap: () => _viewAttachment(a.id, a.generatedName),
                        ),
                      )),
                ],
              ),
              if (_busy) Container(color: Colors.black12, child: const Center(child: CircularProgressIndicator())),
            ]);
          },
        ),
      ),
    );
  }
}
