import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../models/contact.dart';
import '../services/api_service.dart';
import '../services/phonebook_service.dart';
import '../store/app_state.dart';
import '../widgets/callable_text.dart';
import 'contact_edit_screen.dart';

class ContactDetailScreen extends StatefulWidget {
  const ContactDetailScreen({super.key, required this.contactId});
  final int contactId;

  @override
  State<ContactDetailScreen> createState() => _ContactDetailScreenState();
}

class _ContactDetailScreenState extends State<ContactDetailScreen> {
  Contact? _contact;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final contact = await context.read<PhoneBookService>().getOne(widget.contactId);
    if (mounted) setState(() { _contact = contact; _loading = false; });
  }

  Future<void> _delete() async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.phoneBookDeleteTitle),
        content: Text(l10n.phoneBookDeleteConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.cancel)),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: Text(l10n.delete)),
        ],
      ),
    );
    if (confirmed == true) {
      await context.read<PhoneBookService>().remove(widget.contactId);
      if (mounted) Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isAdmin = context.watch<AppState>().currentUser?.role == 'admin';
    final c = _contact;

    return Scaffold(
      appBar: AppBar(
        title: Text(c?.fullName ?? ''),
        actions: isAdmin && c != null
            ? [
                IconButton(
                  icon: const Icon(Icons.edit_outlined),
                  onPressed: () async {
                    final updated = await Navigator.of(context).push<bool>(
                      MaterialPageRoute(builder: (_) => ContactEditScreen(contact: c)),
                    );
                    if (updated == true) _load();
                  },
                ),
                IconButton(icon: const Icon(Icons.delete_outline), onPressed: _delete),
              ]
            : null,
      ),
      body: _loading || c == null
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: ListView(
                padding: const EdgeInsets.all(18),
                children: [
                  if (c.hasPhoto)
                    Center(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: FutureBuilder<Uint8List>(
                          future: context.read<ApiService>().getBytes('/phonebook/${widget.contactId}/photo'),
                          builder: (context, snap) {
                            if (!snap.hasData) {
                              return const SizedBox(height: 160, width: 160, child: Center(child: CircularProgressIndicator()));
                            }
                            return Image.memory(snap.data!, height: 160, width: 160, fit: BoxFit.cover);
                          },
                        ),
                      ),
                    )
                  else
                    const Center(
                      child: CircleAvatar(radius: 48, child: Icon(Icons.person_outline, size: 48)),
                    ),
                  const SizedBox(height: 20),
                  _row(l10n.phoneBookFieldPhone, CallableText(c.phone)),
                  if (c.email?.isNotEmpty == true) _row(l10n.phoneBookFieldEmail, Text(c.email!)),
                  if (c.position?.isNotEmpty == true) _row(l10n.phoneBookFieldPosition, Text(c.position!)),
                  if (c.organization != null) _row(l10n.phoneBookFieldOrganization, Text(c.organization!.name)),
                  if (c.city != null) _row(l10n.phoneBookFieldCity, Text(c.city!.name)),
                  if (c.notes?.isNotEmpty == true) _row(l10n.phoneBookFieldNotes, Text(c.notes!)),
                ],
              ),
            ),
    );
  }

  Widget _row(String label, Widget value) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.inkSoft, letterSpacing: 0.4)),
            const SizedBox(height: 4),
            value,
          ],
        ),
      );
}
