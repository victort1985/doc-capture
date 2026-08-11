import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
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

class MyTimekeeperScreen extends StatefulWidget {
  const MyTimekeeperScreen({super.key});
  @override
  State<MyTimekeeperScreen> createState() => _MyTimekeeperScreenState();
}

class _MyTimekeeperScreenState extends State<MyTimekeeperScreen> {
  late final PayrollService _svc;
  TimekeeperPeriod? _period;
  bool _loading = true;
  String? _error;
  DateTime _monthAnchor = DateTime(DateTime.now().year, DateTime.now().month, 1);

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
      final from = _fmt(_monthAnchor);
      final lastDay = DateTime(_monthAnchor.year, _monthAnchor.month + 1, 0);
      final to = _fmt(lastDay);
      final period = await _svc.getMyTimekeeper(from, to);
      setState(() => _period = period);
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      setState(() => _loading = false);
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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final period = _period;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myTimekeeperTitle),
        actions: [
          IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _shiftMonth(-1)),
          Center(child: Text('${_monthAnchor.month}/${_monthAnchor.year}')),
          IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _shiftMonth(1)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center)))
              : period == null || period.shifts.isEmpty
                  ? Center(child: Text(l10n.payrollNoData))
                  : ListView(
                      padding: const EdgeInsets.all(16),
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
                            child: ListTile(
                              title: Text(shift.date),
                              subtitle: Text('${TimeOfDay.fromDateTime(shift.clockIn.toLocal()).format(context)} – ${TimeOfDay.fromDateTime(shift.clockOut.toLocal()).format(context)}'),
                              trailing: Text('${shift.hours.total.toStringAsFixed(1)}h'),
                            ),
                          ),
                      ],
                    ),
    );
  }
}
