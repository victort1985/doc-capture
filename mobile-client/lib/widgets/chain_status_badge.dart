import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';

/// One request item for the batch status call.
class ChainStatusRequest {
  const ChainStatusRequest(this.docType, this.id);
  final String docType;
  final int id;
  String get key => '$docType:$id';
}

/// Fetches chain status for a whole list of documents in one
/// round-trip via POST /order-chain/status-batch. Returns a map keyed
/// by "docType:id" — look up with ChainStatusRequest.key.
Future<Map<String, dynamic>> fetchChainStatusBatch(BuildContext context, List<ChainStatusRequest> requests) async {
  if (requests.isEmpty) return {};
  final res = await context.read<ApiService>().post('/order-chain/status-batch', {
    'requests': requests.map((r) => {'docType': r.docType, 'id': r.id}).toList(),
  });
  return Map<String, dynamic>.from(res);
}

/// Small dot/check badge — green check when complete (a payment
/// exists in the chain), an amber dot with a step count otherwise, or
/// nothing at all if the document isn't part of any chain yet.
class ChainStatusBadge extends StatelessWidget {
  const ChainStatusBadge({super.key, required this.status});
  final Map<String, dynamic>? status;

  int _stepCount(Map<String, dynamic> s) {
    var count = 0;
    if (s['hasQuote'] == true) count++;
    if (s['hasOrder'] == true) count++;
    if (s['hasDeliveryNote'] == true) count++;
    if (s['hasInvoice'] == true) count++;
    if (s['hasPayment'] == true) count++;
    return count;
  }

  @override
  Widget build(BuildContext context) {
    final s = status;
    if (s == null) return const SizedBox(width: 20, height: 20);

    final complete = s['complete'] == true;
    final steps = _stepCount(s);
    if (steps == 0) return const SizedBox.shrink();

    final l10n = AppLocalizations.of(context)!;
    return Tooltip(
      message: complete ? l10n.chainComplete : '${l10n.chainInProgress} ($steps/5)',
      child: complete
          ? const Icon(Icons.check_circle, color: AppColors.success, size: 18)
          : Container(
              width: 18, height: 18,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: AppColors.stampWash, borderRadius: BorderRadius.circular(9)),
              child: Text('$steps', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.stamp)),
            ),
    );
  }
}
