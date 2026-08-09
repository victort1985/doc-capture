import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/time_clock_service.dart';

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
      setState(() => _error = e.toString());
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
      setState(() => _error = e.toString());
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
      setState(() => _error = e.toString());
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
