import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../models/contact.dart';
import '../models/location.dart' as loc;
import '../services/locations_service.dart';
import '../services/phonebook_service.dart';
import '../widgets/search_picker_field.dart';

/// Add (contact == null) or edit (contact != null) a phone book contact.
/// Reachable only from admin-gated entry points (FAB / edit button on
/// PhoneBookScreen / ContactDetailScreen) — no role check needed here
/// itself, since the server also enforces admin-only writes regardless.
class ContactEditScreen extends StatefulWidget {
  const ContactEditScreen({super.key, this.contact, this.initialCategory});
  final Contact? contact;
  final ContactCategory? initialCategory;

  @override
  State<ContactEditScreen> createState() => _ContactEditScreenState();
}

class _ContactEditScreenState extends State<ContactEditScreen> {
  late final _firstName = TextEditingController(text: widget.contact?.firstName ?? '');
  late final _lastName = TextEditingController(text: widget.contact?.lastName ?? '');
  late final _position = TextEditingController(text: widget.contact?.position ?? '');
  late final _phone = TextEditingController(text: widget.contact?.phone ?? '');
  late final _email = TextEditingController(text: widget.contact?.email ?? '');
  late final _notes = TextEditingController(text: widget.contact?.notes ?? '');
  late final _cityField = TextEditingController(text: widget.contact?.city?.name ?? '');
  late final _orgField = TextEditingController(text: widget.contact?.organization?.name ?? '');

  late ContactCategory _category = widget.contact?.category ?? widget.initialCategory ?? ContactCategory.client;
  loc.City? _selectedCity;
  loc.Location? _selectedOrganization;
  File? _photo;
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.contact != null;

  Future<void> _pickPhoto(ImageSource source) async {
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 90);
    if (picked != null) setState(() => _photo = File(picked.path));
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;
    if (_firstName.text.trim().isEmpty || _lastName.text.trim().isEmpty || _phone.text.trim().isEmpty) {
      setState(() => _error = l10n.phoneBookValidationError);
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      final service = context.read<PhoneBookService>();
      if (_isEdit) {
        await service.update(
          widget.contact!.id,
          category: _category,
          firstName: _firstName.text.trim(),
          lastName: _lastName.text.trim(),
          cityId: _selectedCity?.id,
          organizationId: _selectedOrganization?.id,
          position: _position.text.trim(),
          phone: _phone.text.trim(),
          email: _email.text.trim(),
          notes: _notes.text.trim(),
          photo: _photo,
        );
      } else {
        await service.create(
          category: _category,
          firstName: _firstName.text.trim(),
          lastName: _lastName.text.trim(),
          cityId: _selectedCity?.id,
          organizationId: _selectedOrganization?.id,
          position: _position.text.trim(),
          phone: _phone.text.trim(),
          email: _email.text.trim(),
          notes: _notes.text.trim(),
          photo: _photo,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      setState(() => _error = l10n.phoneBookSaveError);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6, top: 14),
        child: Text(text, style: const TextStyle(
          fontSize: 11.5, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft,
        )),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? l10n.phoneBookEditTitle : l10n.phoneBookAddTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 24),
          children: [
            Center(
              child: GestureDetector(
                onTap: () => showModalBottomSheet(
                  context: context,
                  builder: (context) => SafeArea(
                    child: Wrap(children: [
                      ListTile(
                        leading: const Icon(Icons.photo_camera_outlined),
                        title: Text(l10n.phoneBookTakePhoto),
                        onTap: () { Navigator.pop(context); _pickPhoto(ImageSource.camera); },
                      ),
                      ListTile(
                        leading: const Icon(Icons.photo_library_outlined),
                        title: Text(l10n.phoneBookChooseFromGallery),
                        onTap: () { Navigator.pop(context); _pickPhoto(ImageSource.gallery); },
                      ),
                    ]),
                  ),
                ),
                child: CircleAvatar(
                  radius: 44,
                  backgroundImage: _photo != null ? FileImage(_photo!) : null,
                  child: _photo == null ? const Icon(Icons.add_a_photo_outlined, size: 28) : null,
                ),
              ),
            ),
            _label(l10n.phoneBookCategory.toUpperCase()),
            SegmentedButton<ContactCategory>(
              segments: [
                ButtonSegment(value: ContactCategory.client, label: Text(l10n.phoneBookClients)),
                ButtonSegment(value: ContactCategory.technician, label: Text(l10n.phoneBookTechnicians)),
                ButtonSegment(value: ContactCategory.supplier, label: Text(l10n.phoneBookSuppliers)),
              ],
              selected: {_category},
              onSelectionChanged: (s) => setState(() => _category = s.first),
            ),
            _label(l10n.phoneBookFieldFirstName.toUpperCase()),
            TextField(controller: _firstName),
            _label(l10n.phoneBookFieldLastName.toUpperCase()),
            TextField(controller: _lastName),
            _label(l10n.phoneBookFieldCity.toUpperCase()),
            SearchPickerField<loc.City>(
              controller: _cityField,
              search: (q) => context.read<LocationsService>().searchCities(q),
              displayString: (c) => c.region != null ? '${c.name} (${c.region!.name})' : c.name,
              onSelected: (c) => setState(() => _selectedCity = c),
            ),
            _label(l10n.phoneBookFieldOrganization.toUpperCase()),
            SearchPickerField<loc.Location>(
              controller: _orgField,
              search: (q) => context.read<LocationsService>().searchLocations(q, cityId: _selectedCity?.id),
              displayString: (l) => l.name,
              onSelected: (l) => setState(() => _selectedOrganization = l),
            ),
            _label(l10n.phoneBookFieldPosition.toUpperCase()),
            TextField(controller: _position),
            _label(l10n.phoneBookFieldPhone.toUpperCase()),
            TextField(controller: _phone, keyboardType: TextInputType.phone),
            _label(l10n.phoneBookFieldEmail.toUpperCase()),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress),
            _label(l10n.phoneBookFieldNotes.toUpperCase()),
            TextField(controller: _notes, maxLines: 3),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: AppColors.stamp, fontSize: 13)),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              icon: _saving
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check, size: 18),
              label: Text(_saving ? l10n.phoneBookSaving : l10n.phoneBookSave),
              onPressed: _saving ? null : _save,
            ),
          ],
        ),
      ),
    );
  }
}
