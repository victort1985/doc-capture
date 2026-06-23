import 'dart:io';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../models/calendar_event.dart';
import '../services/calendar_service.dart';
import '../widgets/media_thumbnail.dart';

/// Predefined color palette — white is the default (no color override).
/// These show in the color picker as circular swatches.
const List<Color> kCalendarColors = [
  Colors.white,       // default
  Color(0xFF4285F4),  // Google Blue
  Color(0xFF0F9D58),  // Google Green
  Color(0xFFDB4437),  // Google Red
  Color(0xFFF4B400),  // Google Yellow
  Color(0xFF9C27B0),  // Purple
  Color(0xFFFF7043),  // Deep Orange
  Color(0xFF00ACC1),  // Cyan
  Color(0xFF8D6E63),  // Brown
  Color(0xFF546E7A),  // Blue Grey
];

String? _colorToHex(Color c) =>
    c == Colors.white ? null : '#${c.value.toRadixString(16).substring(2).toUpperCase()}';

Color _hexToColor(String? hex) {
  if (hex == null) return Colors.white;
  try { return Color(int.parse(hex.replaceFirst('#', '0xFF'))); } catch (_) { return Colors.white; }
}

class CalendarEventScreen extends StatefulWidget {
  const CalendarEventScreen({super.key, this.event, this.initialDate, this.initialEndDate});
  final CalendarEvent? event;
  final DateTime? initialDate;
  final DateTime? initialEndDate;

  @override
  State<CalendarEventScreen> createState() => _CalendarEventScreenState();
}

class _CalendarEventScreenState extends State<CalendarEventScreen> {
  final _titleCtrl   = TextEditingController();
  final _descCtrl    = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _techCtrl    = TextEditingController();
  final _equipCtrl   = TextEditingController();

  late CalendarEventType _type;
  late DateTime _startAt;
  DateTime? _endAt;
  late bool _allDay;
  late CalendarEventRepeat _repeat;
  bool _done = false;
  Color _selectedColor = Colors.white;
  bool _saving = false;

  bool get _isEdit => widget.event != null;

  @override
  void initState() {
    super.initState();
    final e   = widget.event;
    final now = widget.initialDate ?? DateTime.now();
    _type  = e?.type ?? CalendarEventType.event;
    _titleCtrl.text    = e?.title    ?? '';
    _descCtrl.text     = e?.description  ?? '';
    _locationCtrl.text = e?.location ?? '';
    _techCtrl.text     = e?.technicalRequirements ?? '';
    _equipCtrl.text    = e?.requiredEquipment     ?? '';
    _startAt = e?.startAt.toLocal() ?? DateTime(now.year, now.month, now.day, now.hour);
    _endAt   = e?.endAt?.toLocal() ?? widget.initialEndDate ?? _startAt.add(const Duration(hours: 1));
    _allDay  = e?.allDay ?? false;
    _repeat  = e?.repeat  ?? CalendarEventRepeat.none;
    _done    = e?.done    ?? false;
    _selectedColor = _hexToColor(e?.color);
  }

  @override
  void dispose() {
    for (final c in [_titleCtrl, _descCtrl, _locationCtrl, _techCtrl, _equipCtrl]) c.dispose();
    super.dispose();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  Future<void> _pickDate({required bool isStart}) async {
    final base   = isStart ? _startAt : (_endAt ?? _startAt);
    final picked = await showDatePicker(context: context, initialDate: base, firstDate: DateTime(2020), lastDate: DateTime(2030));
    if (picked == null) return;
    if (isStart) {
      setState(() => _startAt = DateTime(picked.year, picked.month, picked.day, _startAt.hour, _startAt.minute));
    } else {
      setState(() => _endAt = DateTime(picked.year, picked.month, picked.day, _endAt?.hour ?? 10, _endAt?.minute ?? 0));
    }
  }

  Future<void> _pickTime({required bool isStart}) async {
    final init   = isStart ? TimeOfDay.fromDateTime(_startAt) : TimeOfDay.fromDateTime(_endAt ?? _startAt);
    final picked = await showTimePicker(context: context, initialTime: init);
    if (picked == null) return;
    if (isStart) {
      setState(() => _startAt = DateTime(_startAt.year, _startAt.month, _startAt.day, picked.hour, picked.minute));
    } else {
      final b = _endAt ?? _startAt;
      setState(() => _endAt = DateTime(b.year, b.month, b.day, picked.hour, picked.minute));
    }
  }

  Map<String, dynamic> _buildPayload() => {
    'title': _titleCtrl.text.trim(),
    if (_descCtrl.text.trim().isNotEmpty) 'description': _descCtrl.text.trim(),
    'startAt': _startAt.toUtc().toIso8601String(),
    if (!_allDay && _endAt != null) 'endAt': _endAt!.toUtc().toIso8601String(),
    'allDay': _allDay,
    'type': _type == CalendarEventType.task ? 'task' : 'event',
    'done': _done,
    if (_locationCtrl.text.trim().isNotEmpty) 'location': _locationCtrl.text.trim(),
    'color': _colorToHex(_selectedColor),
    'repeat': repeatToJson(_repeat),
    if (_techCtrl.text.trim().isNotEmpty) 'technicalRequirements': _techCtrl.text.trim(),
    if (_equipCtrl.text.trim().isNotEmpty) 'requiredEquipment': _equipCtrl.text.trim(),
  };

  Future<void> _save() async {
    if (_titleCtrl.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final svc = context.read<CalendarService>();
      if (_isEdit) {
        await svc.updateEvent(widget.event!.id, _buildPayload());
      } else {
        await svc.createEvent(
          title: _titleCtrl.text.trim(),
          description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
          startAt: _startAt.toUtc(),
          endAt: _allDay ? null : _endAt?.toUtc(),
          allDay: _allDay,
          type: _type,
          location: _locationCtrl.text.trim().isEmpty ? null : _locationCtrl.text.trim(),
          color: _colorToHex(_selectedColor),
          repeat: _repeat,
          technicalRequirements: _techCtrl.text.trim().isEmpty ? null : _techCtrl.text.trim(),
          requiredEquipment: _equipCtrl.text.trim().isEmpty ? null : _equipCtrl.text.trim(),
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
          TextButton(style: TextButton.styleFrom(foregroundColor: Colors.red), onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await context.read<CalendarService>().removeEvent(widget.event!.id);
    if (mounted) Navigator.of(context).pop(true);
  }

  Future<void> _addAttachment(ImageSource? imageSource) async {
    if (!_isEdit) return;
    File? file;
    if (imageSource != null) {
      final picked = await ImagePicker().pickImage(source: imageSource, imageQuality: 88);
      if (picked != null) file = File(picked.path);
    } else {
      final result = await FilePicker.platform.pickFiles(type: FileType.any);
      if (result?.files.single.path != null) file = File(result!.files.single.path!);
    }
    if (file == null || !mounted) return;
    await context.read<CalendarService>().addAttachment(widget.event!.id, file);
    if (mounted) setState(() {});
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(top: 18, bottom: 6),
    child: Text(text.toUpperCase(),
      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: AppColors.inkSoft)),
  );

  Widget _field(TextEditingController ctrl, String hint, {int maxLines = 1}) =>
      TextField(controller: ctrl, maxLines: maxLines,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(hintText: hint));

  String _fmt(DateTime d) {
    final l = d.toLocal();
    return '${l.day.toString().padLeft(2,'0')}.${l.month.toString().padLeft(2,'0')}.${l.year}';
  }
  String _fmtT(DateTime d) {
    final l = d.toLocal();
    return '${l.hour.toString().padLeft(2,'0')}:${l.minute.toString().padLeft(2,'0')}';
  }

  String _repeatLabel(AppLocalizations l10n, CalendarEventRepeat r) {
    switch (r) {
      case CalendarEventRepeat.daily:   return l10n.calendarRepeatDaily;
      case CalendarEventRepeat.weekly:  return l10n.calendarRepeatWeekly;
      case CalendarEventRepeat.monthly: return l10n.calendarRepeatMonthly;
      case CalendarEventRepeat.yearly:  return l10n.calendarRepeatYearly;
      default: return l10n.calendarRepeatNone;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? l10n.calendarEditEvent : l10n.calendarNewEvent),
        actions: [
          if (_isEdit) IconButton(icon: const Icon(Icons.delete_outline), onPressed: _delete),
          TextButton(
            onPressed: _saving ? null : _save,
            child: _saving
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(l10n.calendarSave, style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      body: SafeArea(child: ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 32), children: [

        // Type toggle
        SegmentedButton<CalendarEventType>(
          showSelectedIcon: false,
          segments: [
            ButtonSegment(value: CalendarEventType.event, label: Text(l10n.calendarTypeEvent), icon: const Icon(Icons.event_outlined, size: 16)),
            ButtonSegment(value: CalendarEventType.task,  label: Text(l10n.calendarTypeTask),  icon: const Icon(Icons.check_circle_outline, size: 16)),
          ],
          selected: {_type},
          onSelectionChanged: (s) => setState(() => _type = s.first),
        ),

        _label(l10n.calendarTitle),
        _field(_titleCtrl, l10n.calendarTitleHint),

        _label(l10n.calendarDescription),
        _field(_descCtrl, l10n.calendarDescriptionHint, maxLines: 3),

        // ── Technical fields ──────────────────────────────────────────────
        _label(l10n.calendarTechnicalRequirements),
        _field(_techCtrl, l10n.calendarTechnicalRequirementsHint, maxLines: 3),

        _label(l10n.calendarRequiredEquipment),
        _field(_equipCtrl, l10n.calendarRequiredEquipmentHint, maxLines: 3),

        _label(l10n.calendarLocation),
        TextField(
          controller: _locationCtrl,
          decoration: const InputDecoration(prefixIcon: Icon(Icons.location_on_outlined, size: 18), hintText: ''),
        ),

        // ── Color picker ──────────────────────────────────────────────────
        _label(l10n.calendarColor),
        Wrap(spacing: 10, runSpacing: 10, children: kCalendarColors.map((c) {
          final isSelected = _selectedColor == c;
          return GestureDetector(
            onTap: () => setState(() => _selectedColor = c),
            child: Container(
              width: 34, height: 34,
              decoration: BoxDecoration(
                color: c,
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? AppColors.primary : Colors.grey.withOpacity(0.4),
                  width: isSelected ? 2.5 : 1,
                ),
                boxShadow: isSelected ? [BoxShadow(color: AppColors.primary.withOpacity(0.35), blurRadius: 6, spreadRadius: 1)] : null,
              ),
              child: isSelected ? Icon(Icons.check, size: 16, color: c == Colors.white ? Colors.black : Colors.white) : null,
            ),
          );
        }).toList()),

        // ── All-day ───────────────────────────────────────────────────────
        const SizedBox(height: 14),
        Row(children: [
          Text(l10n.calendarAllDay),
          const Spacer(),
          Switch(value: _allDay, onChanged: (v) => setState(() => _allDay = v)),
        ]),

        // ── Start ─────────────────────────────────────────────────────────
        _label(l10n.calendarStart),
        Row(children: [
          Expanded(child: OutlinedButton.icon(
            onPressed: () => _pickDate(isStart: true),
            icon: const Icon(Icons.calendar_today_outlined, size: 15),
            label: Text(_fmt(_startAt)),
          )),
          if (!_allDay) ...[const SizedBox(width: 8), OutlinedButton(onPressed: () => _pickTime(isStart: true), child: Text(_fmtT(_startAt)))],
        ]),

        // ── End ───────────────────────────────────────────────────────────
        if (!_allDay) ...[
          _label(l10n.calendarEnd),
          Row(children: [
            Expanded(child: OutlinedButton.icon(
              onPressed: () => _pickDate(isStart: false),
              icon: const Icon(Icons.calendar_today_outlined, size: 15),
              label: Text(_fmt(_endAt ?? _startAt)),
            )),
            const SizedBox(width: 8),
            OutlinedButton(onPressed: () => _pickTime(isStart: false), child: Text(_fmtT(_endAt ?? _startAt))),
          ]),
        ],

        // ── Repeat ────────────────────────────────────────────────────────
        _label(l10n.calendarRepeat),
        DropdownButtonFormField<CalendarEventRepeat>(
          value: _repeat,
          items: CalendarEventRepeat.values.map((r) => DropdownMenuItem(value: r, child: Text(_repeatLabel(l10n, r)))).toList(),
          onChanged: (v) => setState(() => _repeat = v!),
        ),

        // ── Task: done ────────────────────────────────────────────────────
        if (_type == CalendarEventType.task) ...[
          const SizedBox(height: 14),
          Row(children: [
            Text(l10n.calendarTaskDone),
            const Spacer(),
            Checkbox(value: _done, onChanged: (v) => setState(() => _done = v ?? false)),
          ]),
        ],

        // ── Attachments ───────────────────────────────────────────────────
        _label(l10n.calendarAttachments),
        if (!_isEdit)
          Text(l10n.calendarAttachmentsSaveFirst, style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5))
        else ...[
          if (widget.event!.attachments.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Wrap(spacing: 10, runSpacing: 10, children: widget.event!.attachments.map((a) =>
                Stack(clipBehavior: Clip.none, children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: a.isPhoto
                      ? MediaThumbnail.photo(url: '/calendar/attachments/${a.id}/download')
                      : const MediaThumbnail.pdf(),
                  ),
                  Positioned(top: -6, right: -6, child: GestureDetector(
                    onTap: () async {
                      await context.read<CalendarService>().removeAttachment(a.id);
                      if (mounted) setState(() {});
                    },
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                      child: const Icon(Icons.close, size: 13, color: Colors.white),
                    ),
                  )),
                ]),
              ).toList()),
            ),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton.icon(onPressed: () => _addAttachment(ImageSource.camera),  icon: const Icon(Icons.camera_alt_outlined, size: 15), label: Text(l10n.calendarCamera)),
            OutlinedButton.icon(onPressed: () => _addAttachment(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined, size: 15), label: Text(l10n.calendarGallery)),
            OutlinedButton.icon(onPressed: () => _addAttachment(null),                icon: const Icon(Icons.attach_file, size: 15), label: Text(l10n.calendarFile)),
          ]),
        ],
      ])),
    );
  }
}
