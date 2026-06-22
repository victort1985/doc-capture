import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:table_calendar/table_calendar.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../models/calendar_event.dart';
import '../services/calendar_service.dart';
import 'calendar_event_screen.dart';

enum _View { month, week, day }

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  DateTime _focusedDay = DateTime.now();
  DateTime _selectedDay = DateTime.now();
  _View _view = _View.month;
  Map<DateTime, List<CalendarEvent>> _eventsByDay = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  DateTime _key(DateTime d) => DateTime(d.year, d.month, d.day);

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final from = DateTime(_focusedDay.year, _focusedDay.month - 1, 1);
      final to   = DateTime(_focusedDay.year, _focusedDay.month + 2, 0, 23, 59, 59);
      final events = await context.read<CalendarService>().listEvents(from, to);
      final map = <DateTime, List<CalendarEvent>>{};
      for (final e in events) {
        map.putIfAbsent(_key(e.startAt.toLocal()), () => []).add(e);
      }
      if (mounted) setState(() { _eventsByDay = map; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<CalendarEvent> _eventsForDay(DateTime d) => _eventsByDay[_key(d)] ?? [];

  Color _eventColor(CalendarEvent e) {
    // Use the user-chosen color if set; white is the explicit default.
    if (e.color != null) {
      try { return Color(int.parse(e.color!.replaceFirst('#', '0xFF'))); } catch (_) {}
    }
    // Fallback for events with no color set (e.g. created before color
    // picker existed) — tasks get stamp color, events get primary.
    return e.type == CalendarEventType.task ? AppColors.stamp : AppColors.primary;
  }

  void _openCreate(DateTime date, {TimeOfDay? time}) async {
    final start = time == null
        ? DateTime(date.year, date.month, date.day, 9)
        : DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final end = start.add(const Duration(hours: 1));
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CalendarEventScreen(initialDate: start, initialEndDate: end)),
    );
    if (ok == true) _load();
  }

  void _openEdit(CalendarEvent e) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CalendarEventScreen(event: e)),
    );
    if (ok == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(l10n.calendarTitle),
        actions: [
          // View switcher
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: SegmentedButton<_View>(
              showSelectedIcon: false,
              style: SegmentedButton.styleFrom(
                textStyle: const TextStyle(fontSize: 11),
                padding: const EdgeInsets.symmetric(horizontal: 6),
              ),
              segments: const [
                ButtonSegment(value: _View.month, label: Text('M')),
                ButtonSegment(value: _View.week,  label: Text('W')),
                ButtonSegment(value: _View.day,   label: Text('D')),
              ],
              selected: {_view},
              onSelectionChanged: (s) => setState(() => _view = s.first),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _openCreate(_selectedDay),
        child: const Icon(Icons.add),
      ),
      body: SafeArea(child: _body(l10n)),
    );
  }

  Widget _body(AppLocalizations l10n) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_view == _View.month) return _MonthView(
      focusedDay: _focusedDay,
      selectedDay: _selectedDay,
      eventsForDay: _eventsForDay,
      eventColor: _eventColor,
      onDaySelected: (s, f) => setState(() { _selectedDay = s; _focusedDay = f; }),
      onPageChanged: (f) { _focusedDay = f; _load(); },
      onEventTap: _openEdit,
      onAddTap: () => _openCreate(_selectedDay),
      loading: _loading,
    );

    if (_view == _View.week) return _WeekTimelineView(
      selectedDay: _selectedDay,
      eventsForDay: _eventsForDay,
      eventColor: _eventColor,
      onDaySelected: (d) => setState(() { _selectedDay = d; _focusedDay = d; }),
      onSlotTap: (d, t) => _openCreate(d, time: t),
      onEventTap: _openEdit,
    );

    return _DayTimelineView(
      day: _selectedDay,
      events: _eventsForDay(_selectedDay),
      eventColor: _eventColor,
      onSlotTap: (t) => _openCreate(_selectedDay, time: t),
      onEventTap: _openEdit,
    );
  }
}

// ─── Month view ──────────────────────────────────────────────────────────────

class _MonthView extends StatelessWidget {
  const _MonthView({
    required this.focusedDay,
    required this.selectedDay,
    required this.eventsForDay,
    required this.eventColor,
    required this.onDaySelected,
    required this.onPageChanged,
    required this.onEventTap,
    required this.onAddTap,
    required this.loading,
  });

  final DateTime focusedDay;
  final DateTime selectedDay;
  final List<CalendarEvent> Function(DateTime) eventsForDay;
  final Color Function(CalendarEvent) eventColor;
  final void Function(DateTime, DateTime) onDaySelected;
  final void Function(DateTime) onPageChanged;
  final void Function(CalendarEvent) onEventTap;
  final VoidCallback onAddTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final dayEvents = eventsForDay(selectedDay);
    return Column(children: [
      // Solid background behind the calendar grid so the logo doesn't bleed through
      Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        elevation: 1,
        child: TableCalendar<CalendarEvent>(
          firstDay: DateTime(2020),
          lastDay: DateTime(2030),
          focusedDay: focusedDay,
          selectedDayPredicate: (d) => isSameDay(d, selectedDay),
          calendarFormat: CalendarFormat.month,
          availableCalendarFormats: const {CalendarFormat.month: 'Month'},
          eventLoader: eventsForDay,
          onDaySelected: onDaySelected,
          onPageChanged: onPageChanged,
          daysOfWeekStyle: const DaysOfWeekStyle(
            weekdayStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            weekendStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
          calendarStyle: CalendarStyle(
            tablePadding: const EdgeInsets.symmetric(horizontal: 6),
            todayDecoration: BoxDecoration(color: AppColors.primary.withOpacity(0.35), shape: BoxShape.circle),
            selectedDecoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
            outsideDaysVisible: false,
          ),
          calendarBuilders: CalendarBuilders(
            markerBuilder: (ctx, day, events) {
              if (events.isEmpty) return null;
              return Positioned(
                bottom: 2,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: events.take(3).map((e) {
                    final col = eventColor(e);
                    final isWhite = col == Colors.white || col.value == 0xFFFFFFFF;
                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 1.5),
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Container(
                            width: 6, height: 6,
                            decoration: BoxDecoration(
                              color: col,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: isWhite ? Colors.grey.shade400 : Colors.transparent,
                                width: isWhite ? 1 : 0,
                              ),
                            ),
                          ),
                          // Paperclip for events with attachments
                          if (e.attachments.isNotEmpty)
                            const Positioned(
                              top: -8, right: -3,
                              child: Icon(Icons.attach_file, size: 8, color: AppColors.inkSoft),
                            ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              );
            },
          ),
        ),
      ),
      const Divider(height: 1),
      Expanded(
        child: dayEvents.isEmpty
            ? Center(child: Text('No events', style: const TextStyle(color: AppColors.inkSoft)))
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
                itemCount: dayEvents.length,
                separatorBuilder: (_, __) => const SizedBox(height: 6),
                itemBuilder: (_, i) => _EventCard(event: dayEvents[i], color: eventColor(dayEvents[i]), onTap: () => onEventTap(dayEvents[i])),
              ),
      ),
    ]);
  }
}

// ─── Day timeline view ────────────────────────────────────────────────────────

const double _hourH = 60.0; // px per hour
const double _labelW = 48.0;

class _DayTimelineView extends StatefulWidget {
  const _DayTimelineView({
    required this.day,
    required this.events,
    required this.eventColor,
    required this.onSlotTap,
    required this.onEventTap,
  });
  final DateTime day;
  final List<CalendarEvent> events;
  final Color Function(CalendarEvent) eventColor;
  final void Function(TimeOfDay) onSlotTap;
  final void Function(CalendarEvent) onEventTap;
  @override
  State<_DayTimelineView> createState() => _DayTimelineViewState();
}

class _DayTimelineViewState extends State<_DayTimelineView> {
  late final ScrollController _scroll;

  @override
  void initState() {
    super.initState();
    final now = TimeOfDay.now();
    // scroll to current time minus 2 hours
    final initialOffset = ((now.hour - 2).clamp(0, 22)) * _hourH;
    _scroll = ScrollController(initialScrollOffset: initialOffset);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      controller: _scroll,
      child: SizedBox(
        height: 24 * _hourH,
        child: Stack(children: [
          // Hour grid
          ..._buildGrid(context),
          // Events
          ...widget.events.where((e) => !e.allDay).map((e) => _positionedEvent(e, context)),
          // Tap detector
          Positioned.fill(
            left: _labelW,
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTapDown: (d) {
                final hour = (d.localPosition.dy / _hourH).floor().clamp(0, 23);
                final min  = ((d.localPosition.dy % _hourH) / _hourH * 60).round();
                widget.onSlotTap(TimeOfDay(hour: hour, minute: min - min % 15));
              },
            ),
          ),
          // Current time indicator
          _currentTimeLine(),
        ]),
      ),
    );
  }

  List<Widget> _buildGrid(BuildContext context) {
    return List.generate(24, (h) => Positioned(
      top: h * _hourH,
      left: 0, right: 0,
      child: SizedBox(
        height: _hourH,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
            width: _labelW,
            child: Padding(
              padding: const EdgeInsets.only(right: 8, top: 2),
              child: Text(
                '${h.toString().padLeft(2, '0')}:00',
                textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 11, color: AppColors.inkSoft),
              ),
            ),
          ),
          Expanded(child: Container(
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(color: Colors.grey.withOpacity(0.25)),
              ),
            ),
          )),
        ]),
      ),
    ));
  }

  Widget _positionedEvent(CalendarEvent e, BuildContext context) {
    final start = e.startAt.toLocal();
    final end   = e.endAt?.toLocal() ?? start.add(const Duration(hours: 1));
    final top    = (start.hour + start.minute / 60.0) * _hourH;
    final height = ((end.difference(start).inMinutes) / 60.0 * _hourH).clamp(22.0, 24 * _hourH);
    final color  = widget.eventColor(e);

    return Positioned(
      top: top,
      left: _labelW + 2,
      right: 4,
      height: height,
      child: GestureDetector(
        onTap: () => widget.onEventTap(e),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          decoration: BoxDecoration(
            color: color.withOpacity(0.85),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            e.title,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
            overflow: TextOverflow.ellipsis,
            maxLines: 2,
          ),
        ),
      ),
    );
  }

  Widget _currentTimeLine() {
    final now = DateTime.now();
    final top  = (now.hour + now.minute / 60.0) * _hourH;
    return Positioned(
      top: top - 1,
      left: _labelW - 4,
      right: 0,
      child: Row(children: [
        Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle)),
        Expanded(child: Container(height: 1.5, color: Colors.red)),
      ]),
    );
  }
}

// ─── Week timeline view ───────────────────────────────────────────────────────

class _WeekTimelineView extends StatefulWidget {
  const _WeekTimelineView({
    required this.selectedDay,
    required this.eventsForDay,
    required this.eventColor,
    required this.onDaySelected,
    required this.onSlotTap,
    required this.onEventTap,
  });
  final DateTime selectedDay;
  final List<CalendarEvent> Function(DateTime) eventsForDay;
  final Color Function(CalendarEvent) eventColor;
  final void Function(DateTime) onDaySelected;
  final void Function(DateTime, TimeOfDay) onSlotTap;
  final void Function(CalendarEvent) onEventTap;
  @override
  State<_WeekTimelineView> createState() => _WeekTimelineViewState();
}

class _WeekTimelineViewState extends State<_WeekTimelineView> {
  late final ScrollController _vScroll;
  late DateTime _weekStart;

  @override
  void initState() {
    super.initState();
    final now = TimeOfDay.now();
    _vScroll = ScrollController(initialScrollOffset: ((now.hour - 2).clamp(0, 22)) * _hourH);
    _weekStart = _getWeekStart(widget.selectedDay);
  }

  @override
  void dispose() { _vScroll.dispose(); super.dispose(); }

  DateTime _getWeekStart(DateTime d) => d.subtract(Duration(days: d.weekday % 7));

  List<DateTime> get _weekDays => List.generate(7, (i) => _weekStart.add(Duration(days: i)));

  @override
  Widget build(BuildContext context) {
    final days = _weekDays;
    const dayLabelH = 48.0;

    return Column(children: [
      // Day header row
      Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        elevation: 1,
        child: Row(children: [
          const SizedBox(width: _labelW),
          ...days.map((d) {
            final isSelected = isSameDay(d, widget.selectedDay);
            final isToday    = isSameDay(d, DateTime.now());
            return Expanded(
              child: GestureDetector(
                onTap: () { setState(() {}); widget.onDaySelected(d); },
                child: Container(
                  height: dayLabelH,
                  alignment: Alignment.center,
                  decoration: isSelected
                      ? BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.primary, width: 2)))
                      : null,
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Text(
                      ['Su','Mo','Tu','We','Th','Fr','Sa'][d.weekday % 7],
                      style: TextStyle(fontSize: 10, color: isToday ? AppColors.primary : AppColors.inkSoft),
                    ),
                    const SizedBox(height: 2),
                    Container(
                      width: 26, height: 26,
                      alignment: Alignment.center,
                      decoration: isToday ? const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle) : null,
                      child: Text(
                        '${d.day}',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: isToday ? Colors.white : null,
                        ),
                      ),
                    ),
                  ]),
                ),
              ),
            );
          }),
        ]),
      ),
      const Divider(height: 1),
      // Scrollable grid
      Expanded(
        child: SingleChildScrollView(
          controller: _vScroll,
          child: SizedBox(
            height: 24 * _hourH,
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Hour labels
              SizedBox(
                width: _labelW,
                child: Stack(
                  children: List.generate(24, (h) => Positioned(
                    top: h * _hourH + 2,
                    left: 0, right: 4,
                    child: Text(
                      '${h.toString().padLeft(2, '0')}:00',
                      textAlign: TextAlign.right,
                      style: const TextStyle(fontSize: 10, color: AppColors.inkSoft),
                    ),
                  )),
                ),
              ),
              // Day columns
              ...days.map((d) => Expanded(
                child: _DayColumn(
                  day: d,
                  events: widget.eventsForDay(d),
                  eventColor: widget.eventColor,
                  onSlotTap: (t) => widget.onSlotTap(d, t),
                  onEventTap: widget.onEventTap,
                  showNowLine: isSameDay(d, DateTime.now()),
                ),
              )),
            ]),
          ),
        ),
      ),
    ]);
  }
}

class _DayColumn extends StatelessWidget {
  const _DayColumn({
    required this.day,
    required this.events,
    required this.eventColor,
    required this.onSlotTap,
    required this.onEventTap,
    required this.showNowLine,
  });
  final DateTime day;
  final List<CalendarEvent> events;
  final Color Function(CalendarEvent) eventColor;
  final void Function(TimeOfDay) onSlotTap;
  final void Function(CalendarEvent) onEventTap;
  final bool showNowLine;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return Stack(children: [
      // Grid lines
      ...List.generate(24, (h) => Positioned(
        top: h * _hourH, left: 0, right: 0,
        child: Container(height: _hourH, decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: Colors.grey.withOpacity(0.2)),
            left: BorderSide(color: Colors.grey.withOpacity(0.15)),
          ),
        )),
      )),
      // Tap detector
      Positioned.fill(child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTapDown: (d) {
          final hour = (d.localPosition.dy / _hourH).floor().clamp(0, 23);
          final rawMin = ((d.localPosition.dy % _hourH) / _hourH * 60).round();
          onSlotTap(TimeOfDay(hour: hour, minute: rawMin - rawMin % 15));
        },
      )),
      // Events
      ...events.where((e) => !e.allDay).map((e) {
        final start = e.startAt.toLocal();
        final end   = e.endAt?.toLocal() ?? start.add(const Duration(hours: 1));
        final top   = (start.hour + start.minute / 60.0) * _hourH;
        final h     = ((end.difference(start).inMinutes) / 60.0 * _hourH).clamp(18.0, 24 * _hourH);
        return Positioned(
          top: top, left: 1, right: 1, height: h,
          child: GestureDetector(
            onTap: () => onEventTap(e),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 2),
              decoration: BoxDecoration(color: eventColor(e).withOpacity(0.85), borderRadius: BorderRadius.circular(3)),
              child: Text(e.title, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis, maxLines: 2),
            ),
          ),
        );
      }),
      // Now line
      if (showNowLine) Positioned(
        top: (now.hour + now.minute / 60.0) * _hourH - 1,
        left: 0, right: 0,
        child: Container(height: 1.5, color: Colors.red),
      ),
    ]);
  }
}

// ─── Shared event card ────────────────────────────────────────────────────────

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, required this.color, required this.onTap});
  final CalendarEvent event;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final start = event.startAt.toLocal();
    final end   = event.endAt?.toLocal();
    final timeStr = event.allDay ? 'All day' :
        '${_t(start)}${end != null ? ' – ${_t(end)}' : ''}';
    final isWhite = color == Colors.white || color.value == 0xFFFFFFFF;
    return Card(
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 4, height: 40,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
            border: Border.all(color: isWhite ? Colors.grey.shade300 : Colors.transparent, width: isWhite ? 1 : 0),
          ),
        ),
        title: Row(children: [
          Expanded(child: Text(event.title, style: const TextStyle(fontWeight: FontWeight.w600))),
          if (event.attachments.isNotEmpty)
            const Icon(Icons.attach_file, size: 14, color: AppColors.inkSoft),
        ]),
        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(timeStr, style: const TextStyle(fontSize: 12)),
          if (event.location?.isNotEmpty == true)
            Text(event.location!, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
        ]),
        trailing: event.type == CalendarEventType.task
            ? Icon(event.done ? Icons.check_circle : Icons.radio_button_unchecked,
                color: isWhite ? AppColors.stamp : color, size: 20)
            : null,
      ),
    );
  }

  String _t(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}
