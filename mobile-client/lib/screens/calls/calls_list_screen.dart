import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../app/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../models/service_call.dart';
import '../../services/calls_service.dart';
import 'create_call_screen.dart';
import 'call_detail_screen.dart';

class CallsListScreen extends StatefulWidget {
  const CallsListScreen({super.key});

  @override
  State<CallsListScreen> createState() => CallsListScreenState();
}

class CallsListScreenState extends State<CallsListScreen> {
  late Future<List<ServiceCall>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<CallsService>().list();
  }

  void refresh() => setState(() => _future = context.read<CallsService>().list());

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
          child: FutureBuilder<List<ServiceCall>>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return Center(child: Text(l10n.callsLoadError));
              }
              final calls = snapshot.data!;
              if (calls.isEmpty) {
                return Center(child: Text(l10n.callsEmpty, style: const TextStyle(color: AppColors.inkSoft)));
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 80),
                itemCount: calls.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final call = calls[i];
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
                      subtitle: Text(call.contactName),
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
              );
            },
          ),
        ),
      ),
    );
  }
}
