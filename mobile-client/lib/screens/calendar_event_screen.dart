import 'dart:io';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../models/calendar_event.dart';
import '../services/api_service.dart';
import '../services/calendar_service.dart';
import '../widgets/media_thumbnail.dart';

class CalendarEventScreen extends StatefulWidget {
  const CalendarEventScreen({super.key, this.event, this.initialDate});
  final CalendarEvent? event;
  final DateTime? initialDate;

  @override
  State<CalendarEventScreen> createState() => _CalendarEventScreenState();
}

class _CalendarEventScreenState extends State<CalendarEventScreen> {
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  late CalendarEventType _type;
  late DateTime _startAt;
  DateTime? _endAt;
  late bool _allDay;
  late CalendarEventRepeat _repeat;
  bool _done = false;
  String? _color;
  bool _saving = false;

  bool get _isEdit => widget.event != null;

  @override
  void initState() {
    super.initState();
    final e = widget.event;
    final now = widget.initialDate ?? DateTime.now();
    _type = e?.type ?? CalendarEventType.event;
    _titleCtrl.text = e?.title ?? '';
    _descCtrl.text = e?.description ?? '';
    _locationCtrl.text = e?.location ?? '';
    _startAt = e?.startAt.toLocal() ?? DateTime(now.year, now.month, now.day, 9);
    _endAt = e?.endAt?.toLocal() ?? DateTime(now.year, now.month, now.day, 10);
    _allDay = e?.allDay ?? false;
    _repeat = e?.repeat ?? CalendarEventRepeat.none;
    _done = e?.done ?? false;
    _color = e?.color;
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool isStart}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isStart ? _startAt : (_endAt ?? _startAt),
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );
    if (picked == null) return;
    if (isStart) {
      setState(() => _startAt = DateTime(picked.year, picked.month, picked.day, _startAt.hour, _startAt.minute));
    } else {
      setState(() => _endAt = DateTime(picked.year, picked.month, picked.day, _endAt?.hour ?? 10, _endAt?.minute ?? 0));
    }
  }

  Future<void> _pickTime({required bool isStart}) async {
    final init = isStart ? TimeOfDay.fromDateTime(_startAt) : TimeOfDay.fromDateTime(_endAt ?? _startAt);
    final picked = await showTimePicker(context: context, initialTime: init);
    if (picked == null) return;
    if (isStart) {
      setState(() => _startAt = DateTime(_startAt.year, _startAt.month, _startAt.day, picked.hour, picked.minute));
    } else {
      final base = _endAt ?? _startAt;
      setState(() => _endAt = DateTime(base.year, base.month, base.day, picked.hour, picked.minute));
    }
  }

  Future<void> _save() async {
    if (_titleCtrl.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final svc = context.read<CalendarService>();
      if (_isEdit) {
        await svc.updateEvent(widget.event!.id, {
          'title': _titleCtrl.text.trim(),
          'description': _descCtrl.text.trim(),
          'startAt': _startAt.toUtc().toIso8601String(),
          'endAt': _allDay ? null : _endAt?.toUtc().toIso8601String(),
          'allDay': _allDay,
          'type': _type == CalendarEventType.task ? 'task' : 'event',
          'done': _done,
          'location': _locationCtrl.text.trim(),
          'color': _color,
          'repeat': repeatToJson(_repeat),
        });
      } else {
        await svc.createEvent(
          title: _titleCtrl.text.trim(),
          description: _descCtrl.text.trim(),
          startAt: _startAt.toUtc(),
          endAt: _allDay ? null : _endAt?.toUtc(),
          allDay: _allDay,
          type: _type,
          location: _locationCtrl.text.trim(),
          color: _color,
          repeat: _repeat,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete?'),
        content: const Text('This event will be permanently deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    await context.read<CalendarService>().removeEvent(widget.event!.id);
    if (mounted) Navigator.of(context).pop(true);
  }

  Future<void> _addPhoto(ImageSource source) async {
    if (!_isEdit) return;
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 90);
    if (picked == null) return;
    await context.read<CalendarService>().addAttachment(widget.event!.id, File(picked.path));
    if (mounted) setState(() {}); // trigger rebuild to show new attachment
  }

  Future<void> _addFile() async {
    if (!_isEdit) return;
    final result = await FilePicker.platform.pickFiles(type: FileType.any);
    if (result?.files.single.path == null) return;
    await context.read<CalendarService>().addAttachment(widget.event!.id, File(result!.files.single.path!));
    if (mounted) setState(() {});
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 6),
        child: Text(text.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft)),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final fmt = (DateTime dt) {
      final d = dt.toLocal();
      return '${d.day.toString().padLeft(2,'0')}.${d.month.toString().padLeft(2,'0')}.${d.year}';
    };
    final fmtT = (DateTime dt) {
      final d = dt.toLocal();
      return '${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? l10n.calendarEditEvent : l10n.calendarNewEvent),
        actions: [
          if (_isEdit) IconButton(icon: const Icon(Icons.delete_outline), onPressed: _delete),
          TextButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(l10n.calendarSave),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
          children: [
            // Type toggle
            SegmentedButton<CalendarEventType>(
              segments: [
                ButtonSegment(value: CalendarEventType.event, label: Text(l10n.calendarTypeEvent), icon: const Icon(Icons.event_outlined, size: 16)),
                ButtonSegment(value: CalendarEventType.task, label: Text(l10n.calendarTypeTask), icon: const Icon(Icons.check_circle_outline, size: 16)),
              ],
              selected: {_type},
              onSelectionChanged: (s) => setState(() => _type = s.first),
            ),

            _label(l10n.calendarTitle),
            TextField(controller: _titleCtrl, textCapitalization: TextCapitalization.sentences, decoration: InputDecoration(hintText: l10n.calendarTitleHint)),

            _label(l10n.calendarDescription),
            TextField(controller: _descCtrl, maxLines: 3, decoration: InputDecoration(hintText: l10n.calendarDescriptionHint)),

            _label(l10n.calendarLocation),
            TextField(controller: _locationCtrl, decoration: const InputDecoration(prefixIcon: Icon(Icons.location_on_outlined, size: 18))),

            // All-day toggle
            const SizedBox(height: 14),
            Row(children: [
              Text(l10n.calendarAllDay),
              const Spacer(),
              Switch(value: _allDay, onChanged: (v) => setState(() => _allDay = v)),
            ]),

            // Date/time pickers
            _label(l10n.calendarStart),
            Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => _pickDate(isStart: true), icon: const Icon(Icons.calendar_today_outlined, size: 16), label: Text(fmt(_startAt)))),
              if (!_allDay) ...[const SizedBox(width: 8), OutlinedButton(onPressed: () => _pickTime(isStart: true), child: Text(fmtT(_startAt)))],
            ]),

            if (!_allDay) ...[
              _label(l10n.calendarEnd),
              Row(children: [
                Expanded(child: OutlinedButton.icon(onPressed: () => _pickDate(isStart: false), icon: const Icon(Icons.calendar_today_outlined, size: 16), label: Text(fmt(_endAt ?? _startAt)))),
                const SizedBox(width: 8),
                OutlinedButton(onPressed: () => _pickTime(isStart: false), child: Text(fmtT(_endAt ?? _startAt))),
              ]),
            ],

            // Repeat
            _label(l10n.calendarRepeat),
            DropdownButtonFormField<CalendarEventRepeat>(
              value: _repeat,
              items: CalendarEventRepeat.values.map((r) => DropdownMenuItem(value: r, child: Text(_repeatLabel(l10n, r)))).toList(),
              onChanged: (v) => setState(() => _repeat = v!),
            ),

            // Task: done toggle
            if (_type == CalendarEventType.task) ...[
              const SizedBox(height: 14),
              Row(children: [
                Text(l10n.calendarTaskDone),
                const Spacer(),
                Checkbox(value: _done, onChanged: (v) => setState(() => _done = v ?? false)),
              ]),
            ],

            // Attachments — only show/add when editing (event must exist to attach)
            _label(l10n.calendarAttachments),
            if (!_isEdit)
              Text(l10n.calendarAttachmentsSaveFirst, style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5))
            else ...[
              if (widget.event!.attachments.isNotEmpty)
                Wrap(spacing: 10, runSpacing: 10, children: widget.event!.attachments.map((a) => _AttachmentChip(
                  attachment: a,
                  onRemove: () async {
                    await context.read<CalendarService>().removeAttachment(a.id);
                    if (mounted) setState(() {});
                  },
                )).toList()),
              const SizedBox(height: 10),
              Wrap(spacing: 8, children: [
                OutlinedButton.icon(onPressed: () => _addPhoto(ImageSource.camera), icon: const Icon(Icons.camera_alt_outlined, size: 16), label: Text(l10n.calendarCamera)),
                OutlinedButton.icon(onPressed: () => _addPhoto(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined, size: 16), label: Text(l10n.calendarGallery)),
                OutlinedButton.icon(onPressed: _addFile, icon: const Icon(Icons.attach_file, size: 16), label: Text(l10n.calendarFile)),
              ]),
            ],
          ],
        ),
      ),
    );
  }

  String _repeatLabel(AppLocalizations l10n, CalendarEventRepeat r) {
    switch (r) {
      case CalendarEventRepeat.daily: return l10n.calendarRepeatDaily;
      case CalendarEventRepeat.weekly: return l10n.calendarRepeatWeekly;
      case CalendarEventRepeat.monthly: return l10n.calendarRepeatMonthly;
      case CalendarEventRepeat.yearly: return l10n.calendarRepeatYearly;
      default: return l10n.calendarRepeatNone;
    }
  }
}

class _AttachmentChip extends StatelessWidget {
  const _AttachmentChip({required this.attachment, required this.onRemove});
  final CalendarAttachment attachment;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: attachment.isPhoto
              ? MediaThumbnail.photo(url: '/calendar/attachments/${attachment.id}/download')
              : const MediaThumbnail.pdf(),
        ),
        Positioned(
          top: -4, right: -4,
          child: GestureDetector(
            onTap: onRemove,
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
              child: const Icon(Icons.close, size: 12, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}
