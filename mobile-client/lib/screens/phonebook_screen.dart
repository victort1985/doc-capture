import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../models/contact.dart';
import '../services/phonebook_service.dart';
import '../store/app_state.dart';
import '../widgets/callable_text.dart';
import 'contact_edit_screen.dart';
import 'contact_detail_screen.dart';

/// Phone book bottom tab (spec items 5-6): three categories
/// (clients/technicians/suppliers), search by first letters, tap a
/// contact to view it, tap-to-call on the phone number directly from the
/// list. Editing (add/edit/delete) is gated to admin role only.
class PhoneBookScreen extends StatefulWidget {
  const PhoneBookScreen({super.key});

  @override
  State<PhoneBookScreen> createState() => _PhoneBookScreenState();
}

class _PhoneBookScreenState extends State<PhoneBookScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 3, vsync: this);
  final _query = TextEditingController();
  List<Contact> _results = [];
  bool _loading = true;

  static const _categories = [ContactCategory.client, ContactCategory.technician, ContactCategory.supplier];

  @override
  void initState() {
    super.initState();
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) _search();
    });
    _search();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _query.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    setState(() => _loading = true);
    try {
      final results = await context.read<PhoneBookService>().search(
            category: _categories[_tabController.index],
            q: _query.text,
          );
      if (mounted) setState(() => _results = results);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isAdmin = context.watch<AppState>().currentUser?.role == 'admin';

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(l10n.phoneBookTitle),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(text: l10n.phoneBookClients),
            Tab(text: l10n.phoneBookTechnicians),
            Tab(text: l10n.phoneBookSuppliers),
          ],
        ),
      ),
      floatingActionButton: isAdmin
          ? FloatingActionButton(
              onPressed: () async {
                final created = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => ContactEditScreen(initialCategory: _categories[_tabController.index])),
                );
                if (created == true) _search();
              },
              child: const Icon(Icons.person_add_outlined),
            )
          : null,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: TextField(
                controller: _query,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search, size: 18),
                  hintText: l10n.phoneBookSearchHint,
                ),
                onChanged: (_) => _search(),
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.contacts_outlined, size: 36, color: AppColors.inkSoft),
                              const SizedBox(height: 10),
                              Text(l10n.phoneBookEmpty, style: const TextStyle(color: AppColors.inkSoft)),
                            ],
                          ),
                        )
                      : ListView.separated(
                          itemCount: _results.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, i) {
                            final c = _results[i];
                            return ListTile(
                              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                              title: Text(c.fullName),
                              subtitle: Text(
                                [c.position, c.organization?.name, c.city?.name].whereType<String>().join(' · '),
                              ),
                              trailing: CallableText(c.phone, icon: false, style: const TextStyle(fontSize: 13)),
                              onTap: () async {
                                final changed = await Navigator.of(context).push<bool>(
                                  MaterialPageRoute(builder: (_) => ContactDetailScreen(contactId: c.id)),
                                );
                                if (changed == true) _search();
                              },
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
