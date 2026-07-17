import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/api_service.dart';
import 'services/license_check_service.dart';

/// Wraps the whole app. FULL_LOCKED replaces everything with a lock
/// screen (mirrors the server: at that point every API call would be
/// rejected anyway). ADMIN_LOCKED (the admin panel is already locked,
/// but the mobile app still has ~48h before it locks too) shows a
/// persistent banner above the normal app instead of blocking it.
class LicenseGate extends StatefulWidget {
  final Widget child;
  const LicenseGate({super.key, required this.child});

  @override
  State<LicenseGate> createState() => _LicenseGateState();
}

class _LicenseGateState extends State<LicenseGate> {
  LicenseStatus? _status;
  Timer? _timer;
  LicenseCheckService? _svc;

  @override
  void initState() {
    super.initState();
    _svc = LicenseCheckService(context.read<ApiService>());
    _check();
    _timer = Timer.periodic(const Duration(minutes: 15), (_) => _check());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _check() async {
    try {
      final status = await _svc!.getStatus();
      if (mounted) setState(() => _status = status);
    } catch (_) {
      // Can't reach the server at all — not a license signal either
      // way, leave whatever we last knew in place.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_status?.isFullLocked == true) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64, height: 64,
                  decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                  child: const Icon(Icons.lock_outline, color: Colors.white, size: 30),
                ),
                const SizedBox(height: 18),
                const Text('This installation is locked', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
                const SizedBox(height: 8),
                const Text(
                  'The license for this installation has not been verified. Contact your Vixor ERP provider to reactivate.',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: _check, child: const Text('Check again')),
              ],
            ),
          ),
        ),
      );
    }

    if (_status?.isAdminLocked == true) {
      return Column(
        children: [
          Material(
            color: const Color(0xFFFFF3E0),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Row(children: [
                  const Icon(Icons.warning_amber_rounded, size: 16, color: Color(0xFF8A4B0A)),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'License check overdue — this app will lock within 48 hours unless a check succeeds.',
                      style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFF8A4B0A)),
                    ),
                  ),
                ]),
              ),
            ),
          ),
          Expanded(child: widget.child),
        ],
      );
    }

    return widget.child;
  }
}
