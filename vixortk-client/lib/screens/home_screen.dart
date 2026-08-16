import 'dart:async';
import 'dart:ui';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/time_clock_service.dart';
import '../services/payroll_service.dart';
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

/// Pure display — the actual clock-in/out ACTION lives on RootScreen's
/// own center FAB (reachable from every tab), not a button here. This
/// screen shows the running timer for whatever shift is currently
/// open (or "not clocked in") plus, if granted, the real-time running
/// monthly gross pay underneath it.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.refreshToken, required this.onClockChanged});

  final int refreshToken;
  final VoidCallback onClockChanged;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final TimeClockService _timeClockSvc;
  late final PayrollService _payrollSvc;
  TimeClockShift? _openShift;
  bool _loading = true;
  String? _error;
  Timer? _ticker;
  Timer? _salaryTicker;
  double? _monthlyGrossPay;
  bool _canViewGrossSalary = false;
  Duration _elapsed = Duration.zero;

  @override
  void initState() {
    super.initState();
    _timeClockSvc = TimeClockService(context.read<ApiService>());
    _payrollSvc = PayrollService(context.read<ApiService>());
    _canViewGrossSalary = context.read<AppState>().currentUser?.hasPermission('payroll.viewMonthlyGrossSalary') ?? false;
    _load();
    if (_canViewGrossSalary) {
      _loadMonthlyGrossPay();
      _salaryTicker = Timer.periodic(const Duration(minutes: 1), (_) {
        if (mounted) _loadMonthlyGrossPay();
      });
    }
  }

  @override
  void didUpdateWidget(covariant HomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.refreshToken != oldWidget.refreshToken) {
      _load();
      if (_canViewGrossSalary) _loadMonthlyGrossPay();
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _salaryTicker?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final status = await _timeClockSvc.myStatus();
      setState(() => _openShift = status);
      _ticker?.cancel();
      if (status != null) {
        _tick();
        _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
      }
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _tick() {
    final shift = _openShift;
    if (shift == null || !mounted) return;
    setState(() => _elapsed = DateTime.now().toUtc().difference(shift.clockIn.toUtc()));
  }

  Future<void> _loadMonthlyGrossPay() async {
    try {
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, 1);
      final to = DateTime(now.year, now.month + 1, 0);
      String fmt(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final payslip = await _payrollSvc.getMyPayslip(fmt(from), fmt(to));
      if (mounted) setState(() => _monthlyGrossPay = payslip.grossPay);
    } catch (_) {
      // Silently ignored — this is a bonus figure, not the point of
      // the screen; a payroll-side error here shouldn't block the
      // timer display, which is the primary thing this screen is for.
    }
  }

  String _formatElapsed(Duration d) {
    final h = d.inHours.toString().padLeft(2, '0');
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: const Text('VixorTK')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async {
                await _load();
                if (_canViewGrossSalary) await _loadMonthlyGrossPay();
              },
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: AppColors.stampWash, borderRadius: BorderRadius.circular(8)),
                      child: Row(children: [
                        const Icon(Icons.error_outline, size: 16, color: AppColors.stamp),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.stamp, fontSize: 13))),
                      ]),
                    ),
                    const SizedBox(height: 24),
                  ],
                  const SizedBox(height: 24),
                  Center(
                    child: Column(children: [
                      Icon(
                        _openShift != null ? Icons.timer_outlined : Icons.timer_off_outlined,
                        size: 40,
                        color: _openShift != null ? AppColors.stamp : AppColors.inkSoft,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _openShift != null ? _formatElapsed(_elapsed) : '00:00:00',
                        style: TextStyle(
                          fontSize: 56, fontWeight: FontWeight.w300, letterSpacing: 1,
                          color: _openShift != null ? AppColors.ink : AppColors.inkSoft,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _openShift != null ? l10n.timeClockClockedInSince : l10n.timeClockNotClockedIn,
                        style: const TextStyle(color: AppColors.inkSoft, fontSize: 14),
                      ),
                      if (_openShift != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          TimeOfDay.fromDateTime(_openShift!.clockIn.toLocal()).format(context),
                          style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5),
                        ),
                      ],
                    ]),
                  ),
                  if (_canViewGrossSalary && _monthlyGrossPay != null) ...[
                    const SizedBox(height: 40),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      decoration: BoxDecoration(
                        color: AppColors.primaryWash,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(l10n.timeClockMonthlyGross, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppColors.primary)),
                          Text('₪${_monthlyGrossPay!.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: AppColors.primary)),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
