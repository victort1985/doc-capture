import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/calls_service.dart';
import '../services/calendar_service.dart';
import '../services/management_services.dart' show FleetService;
import '../models/service_call.dart';
import '../models/calendar_event.dart';

class _AttentionItem {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  _AttentionItem({required this.icon, required this.color, required this.title, required this.subtitle});
}

/// Checked once per HomeScreen mount (see home_screen.dart's
/// initState — NOT re-checked on every pull-to-refresh, so this
/// doesn't nag repeatedly within the same session), gathering
/// anything across the app that genuinely needs a person's attention
/// right now rather than making them go looking for it:
///   - calls that have been open for more than a day (not just
///     "open" — a call opened 20 minutes ago isn't stale yet)
///   - today's calendar events
///   - vehicle inspections/tests due within a month (reuses
///     FleetService.reminders()'s own "next 30 days or overdue"
///     window, already built for exactly this)
///
/// Each source is fetched independently and a failure in one (e.g.
/// no fleet access, or the calls API being briefly down) never blocks
/// the others — same resilience principle HomeScreen's own stat cards
/// already use. Shows nothing at all if every source comes back
/// empty, rather than an empty "nothing to see here" sheet.
Future<void> checkAttentionItems(BuildContext context) async {
  final api = context.read<ApiService>();
  final l10n = AppLocalizations.of(context)!;
  final items = <_AttentionItem>[];

  try {
    final calls = await CallsService(api).list();
    final now = DateTime.now();
    final staleCalls = calls.where((c) => c.status != CallStatus.closed && now.difference(c.createdAt).inDays >= 1).toList();
    for (final c in staleCalls) {
      final days = now.difference(c.createdAt).inDays;
      items.add(_AttentionItem(
        icon: Icons.support_agent_outlined,
        color: AppColors.stamp,
        title: c.place,
        subtitle: '${l10n.attentionDaysOpen(days)} · ${c.contactName}',
      ));
    }
  } catch (_) {}

  try {
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    final endOfToday = startOfToday.add(const Duration(days: 1));
    final events = await CalendarService(api).listEvents(startOfToday, endOfToday);
    for (final e in events) {
      items.add(_AttentionItem(
        icon: Icons.calendar_month_outlined,
        color: AppColors.primary,
        title: e.title,
        subtitle: e.allDay ? '' : '${e.startAt.hour.toString().padLeft(2, '0')}:${e.startAt.minute.toString().padLeft(2, '0')}${e.location != null ? ' · ${e.location}' : ''}',
      ));
    }
  } catch (_) {}

  try {
    final reminders = await FleetService(api).listReminders();
    for (final r in reminders) {
      final vehicle = r['vehicle'] as Map<String, dynamic>?;
      final make = vehicle?['make'] ?? '';
      final model = vehicle?['model'] ?? '';
      final plate = vehicle?['licensePlate'] ?? '';
      final typeLabel = r['type'] == 'inspection' ? l10n.attentionInspection : l10n.attentionTest;
      items.add(_AttentionItem(
        icon: Icons.directions_car_outlined,
        color: AppColors.primarySoft,
        title: '$make $model ($plate)',
        subtitle: l10n.attentionDueOn(typeLabel, r['dueDate'] as String? ?? ''),
      ));
    }
  } catch (_) {}

  if (items.isEmpty || !context.mounted) return;

  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => DraggableScrollableSheet(
      initialChildSize: 0.5,
      maxChildSize: 0.85,
      minChildSize: 0.3,
      expand: false,
      builder: (ctx, scrollController) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(3)),
              ),
            ),
            Text(l10n.attentionTitle, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.primary)),
            const SizedBox(height: 4),
            Text(l10n.attentionSubtitle, style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft)),
            const SizedBox(height: 14),
            Expanded(
              child: ListView.separated(
                controller: scrollController,
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final it = items[i];
                  return Card(
                    child: ListTile(
                      leading: CircleAvatar(backgroundColor: it.color.withOpacity(0.12), child: Icon(it.icon, color: it.color, size: 20)),
                      title: Text(it.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                      subtitle: it.subtitle.isEmpty ? null : Text(it.subtitle, style: const TextStyle(fontSize: 12)),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
