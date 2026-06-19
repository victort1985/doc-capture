import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../services/connection_diagnostics.dart';
import '../services/settings_service.dart';

/// TEMPORARY diagnostic screen — turns the manual curl-based debugging
/// sequence used throughout this project's Cloudflare setup (DNS lookup,
/// raw TCP reachability per address family, then an HTTP request through
/// the app's real connection path) into a single in-app button, plus a
/// live log of every request the app actually makes. Intended to be
/// removed once cloud-mode connectivity is confirmed solid across real
/// devices and networks — see connection_diagnostics.dart.
class ConnectionDiagnosticsScreen extends StatefulWidget {
  const ConnectionDiagnosticsScreen({
    super.key,
    required this.config,
    required this.clientId,
    required this.clientSecret,
  });

  final ConnectionConfig config;
  final String? clientId;
  final String? clientSecret;

  @override
  State<ConnectionDiagnosticsScreen> createState() => _ConnectionDiagnosticsScreenState();
}

class _ConnectionDiagnosticsScreenState extends State<ConnectionDiagnosticsScreen> {
  bool _running = false;
  List<DiagnosticStepResult>? _results;

  Future<void> _runTest() async {
    setState(() { _running = true; _results = null; });
    final results = await runConnectionTest(
      widget.config,
      clientId: widget.clientId,
      clientSecret: widget.clientSecret,
    );
    if (!mounted) return;
    setState(() { _running = false; _results = results; });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Connection diagnostics')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Text(
            'Tests the address and token currently typed on the previous screen — '
            'works even if you haven\'t tapped Save yet.',
            style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: _running ? null : _runTest,
            icon: _running
                ? const SizedBox(
                    height: 16, width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.network_check, size: 18),
            label: Text(_running ? 'Testing…' : 'Run test'),
          ),
          if (_results != null) ...[
            const SizedBox(height: 18),
            ..._results!.map((r) => _ResultTile(result: r)),
          ],
          const SizedBox(height: 28),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Recent requests', style: TextStyle(fontWeight: FontWeight.w600)),
              TextButton(
                onPressed: () => ConnectionDiagnostics.instance.clear(),
                child: const Text('Clear'),
              ),
            ],
          ),
          ValueListenableBuilder<List<ConnectionLogEntry>>(
            valueListenable: ConnectionDiagnostics.instance.log,
            builder: (context, entries, _) {
              if (entries.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('No requests logged yet.', style: TextStyle(color: AppColors.inkSoft)),
                );
              }
              return Column(
                children: entries.map((e) => _LogTile(entry: e)).toList(),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ResultTile extends StatelessWidget {
  const _ResultTile({required this.result});
  final DiagnosticStepResult result;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            result.passed ? Icons.check_circle : Icons.cancel,
            color: result.passed ? Colors.green : AppColors.primary,
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(result.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                Text(result.detail, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LogTile extends StatelessWidget {
  const _LogTile({required this.entry});
  final ConnectionLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final t = entry.time;
    final timeStr = '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}:${t.second.toString().padLeft(2, '0')}';
    final ok = entry.statusCode != null && entry.statusCode! < 400;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(timeStr, style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${entry.method} ${entry.url}', style: const TextStyle(fontSize: 12)),
                Text(
                  entry.summary,
                  style: TextStyle(fontSize: 11, color: ok ? Colors.green : AppColors.primary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
