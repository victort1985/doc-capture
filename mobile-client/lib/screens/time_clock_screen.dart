import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/time_clock_service.dart';

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
  TimeClockShift? _openShift;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _svc = TimeClockService(context.read<ApiService>());
    _load();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
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
    );
  }
}
