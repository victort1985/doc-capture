import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/time_clock_service.dart';
import '../services/payroll_service.dart';
import '../store/app_state.dart';

/// Surfaces the server's own error message (e.g. "Already clocked in
/// since 10:23…", "No open shift to clock out of.") rather than
/// Dio's own generic exception description — the raw DioException
/// toString() a person saw before this fix explains Dio's *plumbing*
/// (validateStatus, where to read HTTP docs) but never actually shows
/// what the server said was wrong, which is the one thing that
/// explains WHY the action failed. Falls back to a plain HTTP-status
/// message only if the server genuinely didn't send a JSON body with
/// a message field (e.g. a network-level failure with no response at
/// all), matching the same overall shape login_screen.dart's own
/// error handling already established for its own DioException cases.
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

class TimeClockScreen extends StatefulWidget {
  const TimeClockScreen({super.key});
  @override
  State<TimeClockScreen> createState() => _TimeClockScreenState();
}

class _TimeClockScreenState extends State<TimeClockScreen> {
  late final TimeClockService _svc;
  late final PayrollService _payrollSvc;
  TimeClockShift? _openShift;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  Timer? _ticker;
  Timer? _salaryTicker;
  double? _monthlyGrossPay;
  bool _canViewGrossSalary = false;

  @override
  void initState() {
    super.initState();
    _svc = TimeClockService(context.read<ApiService>());
    _payrollSvc = PayrollService(context.read<ApiService>());
    _canViewGrossSalary = context.read<AppState>().currentUser?.hasPermission('payroll.viewMonthlyGrossSalary') ?? false;
    _load();
    if (_canViewGrossSalary) {
      _loadMonthlyGrossPay();
      // Refreshed periodically (not just once) so the figure actually
      // behaves like a "real-time" running total, matching what was
      // asked for — every 60s, same cadence as the existing elapsed-
      // time ticker below, rather than a separate faster interval that
      // would just hammer the server for a number that only meaningfully
      // changes as whole minutes of clocked-in time accumulate anyway.
      _salaryTicker = Timer.periodic(const Duration(minutes: 1), (_) {
        if (mounted) _loadMonthlyGrossPay();
      });
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _salaryTicker?.cancel();
    super.dispose();
  }

  /// Silently does nothing on failure — this widget is a bonus, not
  /// the point of the screen (clocking in/out still has to work even
  /// if, say, salary settings were never configured for this
  /// employee and the payslip endpoint errors for some unrelated
  /// reason). No error banner here would just be noise layered on top
  /// of whatever the main clock-in/out flow's own error handling
  /// already shows.
  Future<void> _loadMonthlyGrossPay() async {
    try {
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, 1);
      final to = DateTime(now.year, now.month + 1, 0);
      String fmt(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final payslip = await _payrollSvc.getMyPayslip(fmt(from), fmt(to));
      if (mounted) setState(() => _monthlyGrossPay = payslip.grossPay);
    } catch (_) {
      // Intentionally swallowed — see this method's own doc comment.
    }
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final status = await _svc.myStatus();
      setState(() => _openShift = status);
      _ticker?.cancel();
      if (status != null) {
        _ticker = Timer.periodic(const Duration(minutes: 1), (_) {
          if (mounted) setState(() {});
        });
      }
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _clockIn() async {
    setState(() { _busy = true; _error = null; });
    try {
      await _svc.clockIn();
      await _load();
      if (_canViewGrossSalary) _loadMonthlyGrossPay();
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _clockOut() async {
    setState(() { _busy = true; _error = null; });
    try {
      await _svc.clockOut();
      await _load();
      if (_canViewGrossSalary) _loadMonthlyGrossPay();
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      setState(() => _busy = false);
    }
  }

  String _formatElapsed(DateTime since) {
    final elapsed = DateTime.now().difference(since);
    final h = elapsed.inHours;
    final m = elapsed.inMinutes % 60;
    return '${h}h ${m}m';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final open = _openShift;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.timeClockTitle)),
      body: Center(
        child: _loading
            ? const CircularProgressIndicator()
            : SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.access_time_filled,
                      size: 56,
                      color: open != null ? Colors.green : Colors.grey,
                    ),
                    const SizedBox(height: 16),
                    if (_error != null) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center),
                      ),
                    ],
                    if (open != null) ...[
                      Text(l10n.timeClockClockedInSince, style: TextStyle(color: Colors.grey.shade600)),
                      const SizedBox(height: 4),
                      Text(
                        TimeOfDay.fromDateTime(open.clockIn.toLocal()).format(context),
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 4),
                      Text(_formatElapsed(open.clockIn), style: const TextStyle(fontSize: 15, color: Colors.green, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _busy ? null : _clockOut,
                          style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
                          icon: const Icon(Icons.stop),
                          label: Text(l10n.timeClockClockOut),
                        ),
                      ),
                    ] else ...[
                      Text(l10n.timeClockNotClockedIn, style: TextStyle(color: Colors.grey.shade600)),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _busy ? null : _clockIn,
                          icon: const Icon(Icons.play_arrow),
                          label: Text(l10n.timeClockClockIn),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
      ),
      bottomNavigationBar: (_canViewGrossSalary && _monthlyGrossPay != null)
          ? SafeArea(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  border: Border(top: BorderSide(color: Colors.grey.shade300)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(l10n.timeClockMonthlyGross, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    Text('₪${_monthlyGrossPay!.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
                  ],
                ),
              ),
            )
          : null,
    );
  }
}
