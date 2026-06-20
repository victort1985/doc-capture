import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../models/contact.dart';
import '../services/phonebook_service.dart';

/// Bottom sheet for picking a phone-book contact, optionally scoped to a
/// single organization (= a Location — "people who work at this place",
/// spec item 4). Returns the selected [Contact], or null if dismissed.
Future<Contact?> showContactPicker(
  BuildContext context, {
  int? organizationId,
}) {
  return showModalBottomSheet<Contact>(
    context: context,
    isScrollControlled: true,
    builder: (context) => _ContactPickerSheet(organizationId: organizationId),
  );
}

class _ContactPickerSheet extends StatefulWidget {
  const _ContactPickerSheet({this.organizationId});
  final int? organizationId;

  @override
  State<_ContactPickerSheet> createState() => _ContactPickerSheetState();
}

class _ContactPickerSheetState extends State<_ContactPickerSheet> {
  final _query = TextEditingController();
  List<Contact> _results = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _search('');
  }

  Future<void> _search(String q) async {
    setState(() => _loading = true);
    try {
      final results = await context.read<PhoneBookService>().search(
            q: q,
            organizationId: widget.organizationId,
          );
      if (mounted) setState(() => _results = results);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Padding(
        padding: EdgeInsets.only(
          left: 16, right: 16, top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 12,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 36, height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(color: AppColors.inkSoft.withOpacity(0.3), borderRadius: BorderRadius.circular(2)),
              alignment: Alignment.center,
            ),
            TextField(
              controller: _query,
              autofocus: true,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 18), hintText: 'Search contacts'),
              onChanged: _search,
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                      ? const Center(child: Text('No contacts found'))
                      : ListView.builder(
                          controller: scrollController,
                          itemCount: _results.length,
                          itemBuilder: (context, i) {
                            final c = _results[i];
                            return ListTile(
                              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                              title: Text(c.fullName),
                              subtitle: Text([c.position, c.organization?.name].whereType<String>().join(' · ')),
                              trailing: Text(c.phone, style: const TextStyle(fontSize: 12)),
                              onTap: () => Navigator.of(context).pop(c),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
