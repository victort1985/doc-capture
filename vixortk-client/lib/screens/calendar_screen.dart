import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import 'package:table_calendar/table_calendar.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/payroll_service.dart';

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

bool _isRestDayShift(TimekeeperShift shift) =>
    shift.hours.restDay > 0 || shift.hours.restDayOvertimeTier1 > 0 || shift.hours.restDayOvertimeTier2 > 0;

enum _CalendarViewMode { month, list }

/// Same underlying data as TimekeeperScreen (GET /payroll/my-timekeeper)
/// — this screen is a different VIEW of the exact same shifts, so the
/// two can never disagree about what happened on a given day. Shabbat/
/// holiday shifts get the same visual treatment (a highlighted marker)
/// in both the month grid and the list, matching TimekeeperScreen's
/// own color-coding.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  late final PayrollService _svc;
  TimekeeperPeriod? _period;
  bool _loading = true;
  String? _error;
  DateTime _monthAnchor = DateTime(DateTime.now().year, DateTime.now().month, 1);
  DateTime? _selectedDay;
  _CalendarViewMode _viewMode = _CalendarViewMode.month;

  @override
  void initState() {
    super.initState();
    _svc = PayrollService(context.read<ApiService>());
    _load();
  }

  String _fmt(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final from = _fmt(DateTime(_monthAnchor.year, _monthAnchor.month, 1));
      final to = _fmt(DateTime(_monthAnchor.year, _monthAnchor.month + 1, 0));
      final period = await _svc.getMyTimekeeper(from, to);
      setState(() => _period = period);
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<TimekeeperShift> _shiftsOnDay(DateTime day) {
    final dateStr = _fmt(day);
    return _period?.shifts.where((s) => s.date == dateStr).toList() ?? [];
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navCalendar),
        actions: [
          IconButton(
            icon: Icon(_viewMode == _CalendarViewMode.month ? Icons.list : Icons.calendar_view_month),
            tooltip: _viewMode == _CalendarViewMode.month ? l10n.calendarListView : l10n.calendarMonthView,
            onPressed: () => setState(() => _viewMode = _viewMode == _CalendarViewMode.month ? _CalendarViewMode.list : _CalendarViewMode.month),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center)))
              : _viewMode == _CalendarViewMode.month
                  ? _buildMonthView(context)
                  : _buildListView(context),
    );
  }

  Widget _buildMonthView(BuildContext context) {
    return Column(children: [
      TableCalendar<TimekeeperShift>(
        firstDay: DateTime(2020, 1, 1),
        lastDay: DateTime(2100, 12, 31),
        focusedDay: _monthAnchor,
        selectedDayPredicate: (day) => _selectedDay != null && isSameDay(_selectedDay!, day),
        eventLoader: _shiftsOnDay,
        onPageChanged: (focusedDay) {
          setState(() => _monthAnchor = DateTime(focusedDay.year, focusedDay.month, 1));
          _load();
        },
        onDaySelected: (selected, focused) => setState(() { _selectedDay = selected; _monthAnchor = DateTime(focused.year, focused.month, 1); }),
        calendarStyle: const CalendarStyle(
          markerDecoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
        ),
        calendarBuilders: CalendarBuilders(
          markerBuilder: (context, day, shifts) {
            if (shifts.isEmpty) return null;
            final hasRestDay = shifts.any(_isRestDayShift);
            return Positioned(
              bottom: 2,
              child: Container(
                width: 7, height: 7,
                decoration: BoxDecoration(color: hasRestDay ? AppColors.stamp : AppColors.primary, shape: BoxShape.circle),
              ),
            );
          },
        ),
      ),
      const Divider(height: 1),
      if (_selectedDay != null)
        Expanded(
          child: _shiftsOnDay(_selectedDay!).isEmpty
              ? Center(child: Text(l10n.payrollNoData))
              : ListView(
                  padding: const EdgeInsets.all(12),
                  children: [for (final shift in _shiftsOnDay(_selectedDay!)) _buildShiftCard(context, shift)],
                ),
        ),
    ]);
  }

  Widget _buildListView(BuildContext context) {
    final shifts = _period?.shifts ?? [];
    if (shifts.isEmpty) return Center(child: Text(AppLocalizations.of(context)!.payrollNoData));
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [for (final shift in shifts) _buildShiftCard(context, shift)],
    );
  }

  Widget _buildShiftCard(BuildContext context, TimekeeperShift shift) {
    final restDay = _isRestDayShift(shift);
    return Card(
      color: restDay ? AppColors.stampWash : null,
      child: ListTile(
        leading: restDay ? const Icon(Icons.brightness_2_outlined, color: AppColors.stamp, size: 20) : const Icon(Icons.schedule, size: 20),
        title: Text(shift.date),
        subtitle: Text('${TimeOfDay.fromDateTime(shift.clockIn.toLocal()).format(context)} – ${TimeOfDay.fromDateTime(shift.clockOut.toLocal()).format(context)}'),
        trailing: Text('${shift.hours.total.toStringAsFixed(1)}h'),
      ),
    );
  }
}
