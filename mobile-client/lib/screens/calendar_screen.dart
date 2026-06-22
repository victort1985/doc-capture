import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:table_calendar/table_calendar.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../models/calendar_event.dart';
import '../services/calendar_service.dart';
import 'calendar_event_screen.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  DateTime _focusedDay = DateTime.now();
  DateTime _selectedDay = DateTime.now();
  CalendarFormat _format = CalendarFormat.month;
  Map<DateTime, List<CalendarEvent>> _eventsByDay = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  DateTime _dayKey(DateTime d) => DateTime(d.year, d.month, d.day);

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final from = DateTime(_focusedDay.year, _focusedDay.month - 1, 1);
      final to = DateTime(_focusedDay.year, _focusedDay.month + 2, 0, 23, 59, 59);
      final events = await context.read<CalendarService>().listEvents(from, to);
      final map = <DateTime, List<CalendarEvent>>{};
      for (final e in events) {
        final key = _dayKey(e.startAt.toLocal());
        map.putIfAbsent(key, () => []).add(e);
      }
      if (mounted) setState(() { _eventsByDay = map; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<CalendarEvent> _eventsForDay(DateTime day) =>
      _eventsByDay[_dayKey(day)] ?? [];

  Color _eventColor(CalendarEvent e) {
    if (e.color != null) {
      try {
        return Color(int.parse(e.color!.replaceFirst('#', '0xFF')));
      } catch (_) {}
    }
    return e.type == CalendarEventType.task ? AppColors.stamp : AppColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final dayEvents = _eventsForDay(_selectedDay);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.calendarTitle)),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final created = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => CalendarEventScreen(initialDate: _selectedDay)),
          );
          if (created == true) _load();
        },
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        child: Column(
          children: [
            TableCalendar<CalendarEvent>(
              firstDay: DateTime(2020),
              lastDay: DateTime(2030),
              focusedDay: _focusedDay,
              selectedDayPredicate: (day) => isSameDay(day, _selectedDay),
              calendarFormat: _format,
              eventLoader: _eventsForDay,
              onDaySelected: (selected, focused) {
                setState(() { _selectedDay = selected; _focusedDay = focused; });
              },
              onFormatChanged: (f) => setState(() => _format = f),
              onPageChanged: (focused) {
                _focusedDay = focused;
                _load();
              },
              calendarStyle: CalendarStyle(
                todayDecoration: BoxDecoration(color: AppColors.primary.withOpacity(0.35), shape: BoxShape.circle),
                selectedDecoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                markerDecoration: const BoxDecoration(color: AppColors.stamp, shape: BoxShape.circle),
                outsideDaysVisible: false,
              ),
              calendarBuilders: CalendarBuilders(
                markerBuilder: (ctx, day, events) {
                  if (events.isEmpty) return null;
                  return Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: events.take(3).map((e) => Container(
                      width: 6, height: 6,
                      margin: const EdgeInsets.symmetric(horizontal: 1),
                      decoration: BoxDecoration(color: _eventColor(e), shape: BoxShape.circle),
                    )).toList(),
                  );
                },
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : dayEvents.isEmpty
                      ? Center(child: Text(l10n.calendarNoEvents, style: const TextStyle(color: AppColors.inkSoft)))
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 14),
                          itemCount: dayEvents.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 6),
                          itemBuilder: (context, i) => _EventTile(
                            event: dayEvents[i],
                            color: _eventColor(dayEvents[i]),
                            onTap: () async {
                              final changed = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(builder: (_) => CalendarEventScreen(event: dayEvents[i])),
                              );
                              if (changed == true) _load();
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event, required this.color, required this.onTap});
  final CalendarEvent event;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final timeStr = event.allDay
        ? 'All day'
        : '${_fmt(event.startAt)}${event.endAt != null ? ' – ${_fmt(event.endAt!)}' : ''}';
    return Card(
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 5, height: 48,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
        ),
        title: Row(children: [
          if (event.type == CalendarEventType.task)
            Icon(event.done ? Icons.check_circle : Icons.radio_button_unchecked, size: 16, color: color),
          if (event.type == CalendarEventType.task) const SizedBox(width: 6),
          Expanded(child: Text(event.title, style: TextStyle(
            fontWeight: FontWeight.w600,
            decoration: event.done ? TextDecoration.lineThrough : null,
          ))),
        ]),
        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(timeStr, style: const TextStyle(fontSize: 12)),
          if (event.location?.isNotEmpty == true)
            Row(children: [
              const Icon(Icons.location_on_outlined, size: 12),
              const SizedBox(width: 2),
              Text(event.location!, style: const TextStyle(fontSize: 12)),
            ]),
          if (event.attachments.isNotEmpty)
            Row(children: [
              const Icon(Icons.attach_file, size: 12),
              Text(' ${event.attachments.length}', style: const TextStyle(fontSize: 12)),
            ]),
        ]),
        trailing: event.repeat != CalendarEventRepeat.none
            ? const Icon(Icons.repeat, size: 16, color: AppColors.inkSoft)
            : null,
      ),
    );
  }

  String _fmt(DateTime dt) {
    final local = dt.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}
