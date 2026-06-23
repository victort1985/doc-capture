import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';

class CallsStatsScreen extends StatefulWidget {
  const CallsStatsScreen({super.key});
  @override
  State<CallsStatsScreen> createState() => _CallsStatsScreenState();
}

class _CallsStatsScreenState extends State<CallsStatsScreen> {
  String _period = 'month';
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final result = await context.read<ApiService>().get('/stats/calls', query: {'period': _period}) as Map<String, dynamic>?;
      if (mounted) setState(() { _data = result; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String _formatDuration(int? seconds) {
    if (seconds == null || seconds == 0) return '—';
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}m';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final totals = (_data?['totals'] as Map<String, dynamic>?) ?? {};
    final byUser = (_data?['byUser'] as List?) ?? [];
    final byDay  = (_data?['byDay']  as List?) ?? [];
    final total  = (totals.values.fold<int>(0, (s, v) => s + (v as int? ?? 0)));

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.statsTitle)),
      body: Column(children: [
        // Period selector
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: SegmentedButton<String>(
            showSelectedIcon: false,
            style: SegmentedButton.styleFrom(textStyle: const TextStyle(fontSize: 12), padding: EdgeInsets.zero),
            segments: [
              ButtonSegment(value: 'day',   label: Text(l10n.statsDay)),
              ButtonSegment(value: 'week',  label: Text(l10n.statsWeek)),
              ButtonSegment(value: 'month', label: Text(l10n.statsMonth)),
              ButtonSegment(value: 'year',  label: Text(l10n.statsYear)),
              ButtonSegment(value: 'all',   label: Text(l10n.statsAll)),
            ],
            selected: {_period},
            onSelectionChanged: (s) { _period = s.first; _load(); },
          ),
        ),

        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(padding: const EdgeInsets.fromLTRB(14, 0, 14, 24), children: [
                        // Summary cards
                        Row(children: [
                          _SumCard(label: l10n.statsTotal, value: '$total', color: AppColors.primary),
                          const SizedBox(width: 8),
                          _SumCard(label: l10n.statsOpen, value: '${totals['open'] ?? 0}', color: Colors.blue),
                          const SizedBox(width: 8),
                          _SumCard(label: l10n.statsInProgress, value: '${totals['in_progress'] ?? 0}', color: Colors.orange),
                          const SizedBox(width: 8),
                          _SumCard(label: l10n.statsClosed, value: '${totals['closed'] ?? 0}', color: Colors.green),
                        ]),

                        const SizedBox(height: 10),
                        // Avg resolution
                        if (_data?['avgResolutionSeconds'] != null)
                          _InfoRow(label: l10n.statsAvgResolution, value: _formatDuration(_data!['avgResolutionSeconds'] as int?)),

                        // Daily chart (simple bar visualization)
                        if (byDay.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          Text(l10n.statsByDay, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                          const SizedBox(height: 8),
                          _SimpleBarChart(days: byDay),
                        ],

                        // By user
                        if (byUser.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          Text(l10n.statsByUser, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                          const SizedBox(height: 6),
                          ...byUser.map((u) => _UserRow(
                            username: u['username'] ?? '',
                            callsWorked: u['callsWorked'] ?? 0,
                            totalSeconds: u['totalSeconds'] ?? 0,
                            formatDuration: _formatDuration,
                          )),
                        ],
                      ]),
                    ),
        ),
      ]),
    );
  }
}

class _SumCard extends StatelessWidget {
  const _SumCard({required this.label, required this.value, required this.color});
  final String label; final String value; final Color color;
  @override
  Widget build(BuildContext context) => Expanded(child: Container(
    padding: const EdgeInsets.symmetric(vertical: 10),
    decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
    child: Column(children: [
      Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
      Text(label, style: const TextStyle(fontSize: 10, color: AppColors.inkSoft), textAlign: TextAlign.center),
    ]),
  ));
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label; final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Text(label, style: const TextStyle(color: AppColors.inkSoft)),
      const Spacer(),
      Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
    ]),
  );
}

class _SimpleBarChart extends StatelessWidget {
  const _SimpleBarChart({required this.days});
  final List days;
  @override
  Widget build(BuildContext context) {
    final max = days.fold<int>(1, (m, d) => (d['count'] as int? ?? 0) > m ? (d['count'] as int) : m);
    return SizedBox(
      height: 80,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: days.map((d) {
          final count = d['count'] as int? ?? 0;
          final frac  = count / max;
          final day   = (d['day'] as String? ?? '').substring(0, 10);
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1),
              child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                if (count > 0) Text('$count', style: const TextStyle(fontSize: 8, color: AppColors.inkSoft)),
                const SizedBox(height: 2),
                FractionallySizedBox(
                  heightFactor: frac.clamp(0.05, 1.0),
                  child: Container(decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.7), borderRadius: const BorderRadius.vertical(top: Radius.circular(3)))),
                ),
                const SizedBox(height: 2),
                Text(day.substring(8), style: const TextStyle(fontSize: 8, color: AppColors.inkSoft)),
              ]),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _UserRow extends StatelessWidget {
  const _UserRow({required this.username, required this.callsWorked, required this.totalSeconds, required this.formatDuration});
  final String username; final int callsWorked; final int totalSeconds;
  final String Function(int?) formatDuration;
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      dense: true,
      leading: const CircleAvatar(radius: 16, child: Icon(Icons.person_outline, size: 18)),
      title: Text(username, style: const TextStyle(fontWeight: FontWeight.w600)),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('$callsWorked calls', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary)),
        Text(formatDuration(totalSeconds), style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
      ]),
    ),
  );
}
