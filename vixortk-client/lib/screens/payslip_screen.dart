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

class PayslipScreen extends StatefulWidget {
  const PayslipScreen({super.key});
  @override
  State<PayslipScreen> createState() => _PayslipScreenState();
}

class _PayslipScreenState extends State<PayslipScreen> {
  late final PayrollService _svc;
  Payslip? _payslip;
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
      final payslip = await _svc.getMyPayslip(from, to);
      setState(() => _payslip = payslip);
    } catch (e) {
      setState(() => _error = _extractErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _shiftMonth(int delta) {
    setState(() => _monthAnchor = DateTime(_monthAnchor.year, _monthAnchor.month + delta, 1));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final payslip = _payslip;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        centerTitle: true,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _shiftMonth(-1)),
            Text('${_monthAnchor.month}/${_monthAnchor.year}'),
            IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _shiftMonth(1)),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center)))
              : payslip == null
                  ? Center(child: Text(l10n.payrollNoData))
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          margin: const EdgeInsets.only(bottom: 16),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade50,
                            border: Border.all(color: Colors.amber.shade200),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(l10n.payslipGrossOnlyDisclaimer, style: const TextStyle(fontSize: 12.5)),
                        ),
                        if (payslip.lines.isEmpty)
                          Padding(padding: const EdgeInsets.all(16), child: Text(l10n.payrollNoData))
                        else
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  for (final line in payslip.lines)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 4),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Expanded(child: Text('${line.category} (${line.hours}h × ${line.ratePercent.toStringAsFixed(0)}%)')),
                                          Text('₪${line.amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        const SizedBox(height: 12),
                        Card(
                          color: Theme.of(context).colorScheme.primaryContainer,
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(l10n.payslipGrossPay, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                Text('₪${payslip.grossPay.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
    );
  }
}
