import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/payroll_service.dart';
import '../services/time_clock_service.dart';
import '../store/app_state.dart';

String _extractErrorMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    final message = (data is Map) ? data['message'] : null;
    if (message is String && message.isNotEmpty) return message;
    if (message is Map && message['message'] is String) return message['message'] as String;
    final status = error.response?.statusCode;
    if (status != null) return 'HTTP $status';
    return error.message ?? error.type.name;
  }
  return error.toString();
}

/// True if any part of this shift fell on Shabbat or a recognized
/// holiday — the backend's own restDay/restDayOvertimeTier1/
/// restDayOvertimeTier2 categories only ever get hours when that's
/// the case (see PayrollCalculationService's own categorizeShift on
/// the server), so a non-zero sum across those three is exactly the
/// signal to highlight this shift differently, without VixorTK
/// needing its own copy of the Shabbat-window/holiday-calendar logic.
bool _isRestDayShift(TimekeeperShift shift) =>
    shift.hours.restDay > 0 || shift.hours.restDayOvertimeTier1 > 0 || shift.hours.restDayOvertimeTier2 > 0;

class TimekeeperScreen extends StatefulWidget {
  const TimekeeperScreen({super.key});
  @override
  State<TimekeeperScreen> createState() => _TimekeeperScreenState();
}

class _TimekeeperScreenState extends State<TimekeeperScreen> {
  late final PayrollService _payrollSvc;
  late final TimeClockService _timeClockSvc;
  TimekeeperPeriod? _period;
  bool _loading = true;
  String? _error;
  DateTime _monthAnchor = DateTime(DateTime.now().year, DateTime.now().month, 1);
  bool _canManageEntries = false;

  @override
  void initState() {
    super.initState();
    _payrollSvc = PayrollService(context.read<ApiService>());
    _timeClockSvc = TimeClockService(context.read<ApiService>());
    _canManageEntries = context.read<AppState>().currentUser?.hasPermission('payroll.manageTimeClockEntries') ?? false;
    _load();
  }

  String _fmt(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final from = _fmt(_monthAnchor);
      final lastDay = DateTime(_monthAnchor.year, _monthAnchor.month + 1, 0);
      final to = _fmt(lastDay);
      final period = await _payrollSvc.getMyTimekeeper(from, to);
      setState(() => _period = period);
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _shiftMonth(int delta) {
    setState(() => _monthAnchor = DateTime(_monthAnchor.year, _monthAnchor.month + delta, 1));
    _load();
  }

  String _categoryLabel(AppLocalizations l10n, String key) {
    switch (key) {
      case 'regular': return l10n.payrollCatRegular;
      case 'overtimeTier1': return l10n.payrollCatOvertime125;
      case 'overtimeTier2': return l10n.payrollCatOvertime150;
      case 'restDay': return l10n.payrollCatRestDay150;
      case 'restDayOvertimeTier1': return l10n.payrollCatRestDayOvertime175;
      case 'restDayOvertimeTier2': return l10n.payrollCatRestDayOvertime200;
      default: return key;
    }
  }

  Future<void> _openAddShiftSheet() async {
    final userId = context.read<AppState>().currentUser?.id;
    if (userId == null) return;
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ShiftFormSheet(userId: userId, timeClockSvc: _timeClockSvc),
    );
    if (result == true) _load();
  }

  Future<void> _openEditShiftSheet(TimekeeperShift shift) async {
    if (!_canManageEntries) return;
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ShiftFormSheet(
        userId: context.read<AppState>().currentUser!.id,
        timeClockSvc: _timeClockSvc,
        existingShift: shift,
      ),
    );
    if (result == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final period = _period;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navTimekeeper),
        actions: [
          IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _shiftMonth(-1)),
          Center(child: Text('${_monthAnchor.month}/${_monthAnchor.year}')),
          IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _shiftMonth(1)),
        ],
      ),
      floatingActionButton: _canManageEntries
          ? FloatingActionButton.extended(
              onPressed: _openAddShiftSheet,
              icon: const Icon(Icons.add),
              label: Text(l10n.timekeeperAddShift),
            )
          : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center)))
              : period == null || period.shifts.isEmpty
                  ? Center(child: Text(l10n.payrollNoData))
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                      children: [
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(l10n.payrollTotalThisMonth, style: const TextStyle(fontWeight: FontWeight.bold)),
                                const SizedBox(height: 8),
                                for (final entry in {
                                  'regular': period.total.regular,
                                  'overtimeTier1': period.total.overtimeTier1,
                                  'overtimeTier2': period.total.overtimeTier2,
                                  'restDay': period.total.restDay,
                                  'restDayOvertimeTier1': period.total.restDayOvertimeTier1,
                                  'restDayOvertimeTier2': period.total.restDayOvertimeTier2,
                                }.entries)
                                  if (entry.value > 0)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 2),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(_categoryLabel(l10n, entry.key)),
                                          Text('${entry.value}h', style: const TextStyle(fontWeight: FontWeight.w600)),
                                        ],
                                      ),
                                    ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        for (final shift in period.shifts)
                          Card(
                            color: _isRestDayShift(shift) ? AppColors.stampWash : null,
                            child: ListTile(
                              leading: _isRestDayShift(shift) ? const Icon(Icons.brightness_2_outlined, color: AppColors.stamp, size: 20) : null,
                              title: Text(shift.date),
                              subtitle: Text('${TimeOfDay.fromDateTime(shift.clockIn.toLocal()).format(context)} – ${TimeOfDay.fromDateTime(shift.clockOut.toLocal()).format(context)}'),
                              trailing: Text('${shift.hours.total.toStringAsFixed(1)}h'),
                              onTap: _canManageEntries ? () => _openEditShiftSheet(shift) : null,
                            ),
                          ),
                      ],
                    ),
    );
  }
}

/// The "wheel" the request asked for — CupertinoDatePicker renders as
/// a genuine spinning-wheel picker on both iOS and Android in Flutter
/// (not a text field to type into), matching the admin panel's own
/// native-HTML-input approach in spirit: nothing to type, just spin
/// to the right value. Server applies the overnight-shift rule (see
/// TimeClockService.createManualEntry's own doc comment) — this sheet
/// just collects date/start/end as plain values and lets the server
/// work out which calendar day the end time actually lands on.
class _ShiftFormSheet extends StatefulWidget {
  const _ShiftFormSheet({required this.userId, required this.timeClockSvc, this.existingShift});
  final int userId;
  final TimeClockService timeClockSvc;
  /// Null means "add a new shift"; non-null means "correct this one" —
  /// the date/start/end pickers below get initialized from it, and
  /// saving calls editEntry instead of createManualEntry.
  final TimekeeperShift? existingShift;

  @override
  State<_ShiftFormSheet> createState() => _ShiftFormSheetState();
}

class _ShiftFormSheetState extends State<_ShiftFormSheet> {
  late DateTime _date;
  late TimeOfDay _startTime;
  late TimeOfDay _endTime;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existingShift;
    if (existing != null) {
      final localIn = existing.clockIn.toLocal();
      _date = DateTime(localIn.year, localIn.month, localIn.day);
      _startTime = TimeOfDay.fromDateTime(localIn);
      _endTime = TimeOfDay.fromDateTime(existing.clockOut.toLocal());
    } else {
      _date = DateTime.now();
      _startTime = const TimeOfDay(hour: 9, minute: 0);
      _endTime = const TimeOfDay(hour: 17, minute: 0);
    }
  }

  String get _dateStr => '${_date.year.toString().padLeft(4, '0')}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';
  String _timeStr(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickDate() async {
    await showModalBottomSheet(
      context: context,
      builder: (_) => SizedBox(
        height: 260,
        child: Column(children: [
          Expanded(
            child: CupertinoDatePicker(
              mode: CupertinoDatePickerMode.date,
              initialDateTime: _date,
              onDateTimeChanged: (d) => setState(() => _date = d),
            ),
          ),
          SafeArea(top: false, child: CupertinoButton(child: const Text('OK'), onPressed: () => Navigator.of(context).pop())),
        ]),
      ),
    );
  }

  Future<void> _pickTime(bool isStart) async {
    final initial = DateTime(2000, 1, 1, isStart ? _startTime.hour : _endTime.hour, isStart ? _startTime.minute : _endTime.minute);
    await showModalBottomSheet(
      context: context,
      builder: (_) => SizedBox(
        height: 260,
        child: Column(children: [
          Expanded(
            child: CupertinoDatePicker(
              mode: CupertinoDatePickerMode.time,
              use24hFormat: true,
              initialDateTime: initial,
              onDateTimeChanged: (d) => setState(() {
                final t = TimeOfDay(hour: d.hour, minute: d.minute);
                if (isStart) { _startTime = t; } else { _endTime = t; }
              }),
            ),
          ),
          SafeArea(top: false, child: CupertinoButton(child: const Text('OK'), onPressed: () => Navigator.of(context).pop())),
        ]),
      ),
    );
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    try {
      final existing = widget.existingShift;
      if (existing == null) {
        await widget.timeClockSvc.createManualEntry(
          userId: widget.userId,
          date: _dateStr,
          startTime: _timeStr(_startTime),
          endTime: _timeStr(_endTime),
        );
      } else {
        // editEntry needs full DateTimes (unlike createManualEntry,
        // which resolves the overnight rule server-side from plain
        // strings) — so the SAME rule (end time-of-day not after
        // start time-of-day means the shift crosses midnight) has to
        // be applied here, client-side, before sending. Matches
        // TimeClockService.createManualEntry's own doc comment
        // exactly, just computed a step earlier in the flow.
        final clockIn = DateTime(_date.year, _date.month, _date.day, _startTime.hour, _startTime.minute);
        final endMinutes = _endTime.hour * 60 + _endTime.minute;
        final startMinutes = _startTime.hour * 60 + _startTime.minute;
        final crossesMidnight = endMinutes <= startMinutes;
        final clockOut = DateTime(_date.year, _date.month, _date.day + (crossesMidnight ? 1 : 0), _endTime.hour, _endTime.minute);
        await widget.timeClockSvc.editEntry(entryId: existing.entryId, clockIn: clockIn, clockOut: clockOut);
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.existingShift == null ? l10n.timekeeperAddShift : l10n.timekeeperEditShift,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.calendar_today_outlined),
                title: Text(l10n.timekeeperShiftDate),
                trailing: Text(_dateStr, style: const TextStyle(fontWeight: FontWeight.w600)),
                onTap: _pickDate,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.login),
                title: Text(l10n.timekeeperStartTime),
                trailing: Text(_timeStr(_startTime), style: const TextStyle(fontWeight: FontWeight.w600)),
                onTap: () => _pickTime(true),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.logout),
                title: Text(l10n.timekeeperEndTime),
                trailing: Text(_timeStr(_endTime), style: const TextStyle(fontWeight: FontWeight.w600)),
                onTap: () => _pickTime(false),
              ),
              const SizedBox(height: 8),
              Text(l10n.timekeeperOvernightHint, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.stampWash, borderRadius: BorderRadius.circular(8)),
                  child: Text(_error!, style: const TextStyle(color: AppColors.stamp, fontSize: 12.5)),
                ),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(l10n.commonSave),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
