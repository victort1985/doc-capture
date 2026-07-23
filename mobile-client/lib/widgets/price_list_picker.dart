import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../services/price_list_service.dart';
import 'search_picker_field.dart';

/// Opens a bottom sheet to pick a device or service from the price
/// list catalog — returns the chosen item, or null if the person
/// cancelled without picking one. The caller fills in whatever
/// fields it wants from the result (typically description + price)
/// and the person can still freely edit them afterward.
Future<PriceListItem?> showPriceListPicker(BuildContext context) async {
  final l10n = AppLocalizations.of(context)!;
  List<PriceListItem>? cache;

  Future<List<PriceListItem>> search(String query) async {
    cache ??= await PriceListService(context.read<ApiService>()).list();
    final q = query.toLowerCase();
    if (q.isEmpty) return cache!;
    return cache!.where((item) => item.name.toLowerCase().contains(q)).toList();
  }

  return showModalBottomSheet<PriceListItem>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.priceListPickTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 4),
          Text(l10n.priceListPickHint, style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft)),
          const SizedBox(height: 12),
          SearchPickerField<PriceListItem>(
            search: search,
            displayString: (i) => i.name,
            listLabel: (i) => '${i.name} · ₪${i.price.toStringAsFixed(2)}',
            hintText: l10n.priceListSearchHint,
            onSelected: (item) => Navigator.of(ctx).pop(item),
          ),
        ],
      ),
    ),
  );
}
