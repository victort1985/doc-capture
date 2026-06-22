import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../app/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../models/service_call.dart';
import '../../services/calls_service.dart';
import '../../widgets/elapsed_timer_text.dart';
import 'create_call_screen.dart';
import 'call_detail_screen.dart';

class CallsListScreen extends StatefulWidget {
  const CallsListScreen({super.key});

  @override
  State<CallsListScreen> createState() => CallsListScreenState();
}

class CallsListScreenState extends State<CallsListScreen> {
  List<ServiceCall> _calls = [];
  bool _loading = true;
  String? _error;
  Timer? _pollTimer;
  static const _pollInterval = Duration(seconds: 15);

  @override
  void initState() {
    super.initState();
    _load(force: true);
    _pollTimer = Timer.periodic(_pollInterval, (_) => _load());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool force = false}) async {
    if (force) setState(() => _loading = true);
    try {
      final service = context.read<CallsService>();
      if (force) service.clearCache();
      final (changed, calls) = await service.listIfChanged();
      if (changed && mounted) {
        setState(() { _calls = calls; _loading = false; _error = null; });
      } else if (force && mounted) {
        setState(() { _loading = false; });
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.toString(); });
    }
  }

  void refresh() => _load(force: true);

  /// Opens a call's detail screen directly — used when tapping a
  /// real-time notification popup (see RootScreen) rather than the
  /// person tapping a row in this list themselves.
  void openCall(int id) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CallDetailScreen(callId: id)),
    ).then((_) => refresh());
  }

  Color _statusColor(CallStatus s) {
    switch (s) {
      case CallStatus.open:
        return AppColors.stamp;
      case CallStatus.inProgress:
        return const Color(0xFFB8860B);
      case CallStatus.closed:
        return AppColors.success;
    }
  }

  String _statusLabel(AppLocalizations l10n, CallStatus s) {
    switch (s) {
      case CallStatus.open:
        return l10n.callStatusOpen;
      case CallStatus.inProgress:
        return l10n.callStatusInProgress;
      case CallStatus.closed:
        return l10n.callStatusClosed;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.callsTitle)),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final created = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => const CreateCallScreen()),
          );
          if (created == true) refresh();
        },
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => refresh(),
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(l10n.callsLoadError))
                  : _calls.isEmpty
                      ? Center(child: Text(l10n.callsEmpty, style: const TextStyle(color: AppColors.inkSoft)))
                      : ListView.separated(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 80),
                itemCount: _calls.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final call = _calls[i];
                  return Card(
                    child: ListTile(
                      onTap: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => CallDetailScreen(callId: call.id)),
                        );
                        refresh();
                      },
                      leading: CircleAvatar(
                        backgroundColor: _statusColor(call.status).withOpacity(0.15),
                        child: Icon(
                          call.urgency == CallUrgency.urgent ? Icons.priority_high : Icons.build_outlined,
                          color: _statusColor(call.status),
                          size: 20,
                        ),
                      ),
                      title: Text(call.place, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(child: Text(call.contactName, overflow: TextOverflow.ellipsis)),
                          const SizedBox(width: 8),
                          const Icon(Icons.timer_outlined, size: 12, color: Colors.red),
                          const SizedBox(width: 2),
                          ElapsedTimerText(
                            start: call.createdAt,
                            end: call.status == CallStatus.closed ? call.statusChangedAt : null,
                            style: const TextStyle(fontSize: 11.5, color: Colors.red, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: _statusColor(call.status).withOpacity(0.12),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          _statusLabel(l10n, call.status),
                          style: TextStyle(color: _statusColor(call.status), fontSize: 11.5, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  );
                },
              ),
        ),
      ),
    );
  }
}
