import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../../app/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../models/service_call.dart';
import '../../models/location.dart' as loc;
import '../../models/contact.dart';
import '../../services/calls_service.dart';
import '../../services/locations_service.dart';
import '../../services/phonebook_service.dart';
import '../../widgets/search_picker_field.dart';
import '../../widgets/contact_picker_sheet.dart';

class CreateCallScreen extends StatefulWidget {
  const CreateCallScreen({super.key});

  @override
  State<CreateCallScreen> createState() => _CreateCallScreenState();
}

class _CreateCallScreenState extends State<CreateCallScreen> {
  final _place = TextEditingController();
  final _contactName = TextEditingController();
  final _contactPosition = TextEditingController();
  final _contactPhone = TextEditingController();
  final _description = TextEditingController();
  CallUrgency _urgency = CallUrgency.notUrgent;
  bool _unusualDamage = false;
  double? _lat;
  double? _lng;
  bool _locating = false;
  bool _saving = false;
  String? _error;

  loc.City? _selectedCity;
  loc.Location? _selectedLocation;

  Future<void> _getLocation() async {
    setState(() { _locating = true; _error = null; });
    try {
      final permission = await Geolocator.checkPermission();
      var granted = permission;
      if (granted == LocationPermission.denied) {
        granted = await Geolocator.requestPermission();
      }
      if (granted == LocationPermission.denied || granted == LocationPermission.deniedForever) {
        throw Exception('permission denied');
      }
      final pos = await Geolocator.getCurrentPosition();
      setState(() { _lat = pos.latitude; _lng = pos.longitude; });
    } catch (_) {
      final l10n = AppLocalizations.of(context)!;
      setState(() => _error = l10n.callLocationError);
    } finally {
      setState(() => _locating = false);
    }
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    if (_place.text.trim().isEmpty ||
        _contactName.text.trim().isEmpty ||
        _contactPosition.text.trim().isEmpty ||
        _contactPhone.text.trim().isEmpty ||
        _description.text.trim().isEmpty) {
      setState(() => _error = l10n.callValidationError);
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await context.read<CallsService>().create(
            place: _place.text.trim(),
            locationId: _selectedLocation?.id,
            latitude: _lat,
            longitude: _lng,
            urgency: _urgency,
            contactName: _contactName.text.trim(),
            contactPosition: _contactPosition.text.trim(),
            contactPhone: _contactPhone.text.trim(),
            description: _description.text.trim(),
            unusualDamage: _unusualDamage,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      setState(() => _error = l10n.callSaveError);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6, top: 2),
        child: Text(text, style: const TextStyle(
          fontSize: 11.5, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: AppColors.inkSoft,
        )),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.callNew)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 24),
          children: [
            _label(l10n.callPlace.toUpperCase()),
            SearchPickerField<loc.City>(
              hintText: l10n.callCityHint,
              controller: null,
              search: (q) => context.read<LocationsService>().searchCities(q),
              displayString: (c) => c.region != null ? '${c.name} (${c.region!.name})' : c.name,
              onSelected: (c) => setState(() {
                _selectedCity = c;
                _selectedLocation = null;
              }),
            ),
            const SizedBox(height: 8),
            SearchPickerField<loc.Location>(
              controller: _place,
              hintText: l10n.callPlaceHint,
              search: (q) => context.read<LocationsService>().searchLocations(q, cityId: _selectedCity?.id),
              displayString: (l) => l.name,
              onTextChanged: (_) => _selectedLocation = null,
              onSelected: (l) => setState(() {
                _selectedLocation = l;
                _selectedCity ??= l.city;
              }),
            ),
            const SizedBox(height: 6),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: _locating ? null : _getLocation,
                icon: _locating
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.my_location_outlined, size: 16),
                label: Text(_lat != null ? l10n.callLocationSet : l10n.callGetLocation),
              ),
            ),
            const SizedBox(height: 14),
            _label(l10n.callUrgency.toUpperCase()),
            SegmentedButton<CallUrgency>(
              segments: [
                ButtonSegment(value: CallUrgency.urgent, label: Text(l10n.callUrgent), icon: const Icon(Icons.priority_high, size: 16)),
                ButtonSegment(value: CallUrgency.notUrgent, label: Text(l10n.callNotUrgent)),
              ],
              selected: {_urgency},
              onSelectionChanged: (s) => setState(() => _urgency = s.first),
            ),
            const SizedBox(height: 18),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () async {
                  final contact = await showContactPicker(context, organizationId: _selectedLocation?.id);
                  if (contact != null) {
                    setState(() {
                      _contactName.text = contact.fullName;
                      _contactPosition.text = contact.position ?? '';
                      _contactPhone.text = contact.phone;
                    });
                  }
                },
                icon: const Icon(Icons.contacts_outlined, size: 16),
                label: Text(l10n.callPickContact),
              ),
            ),
            _label(l10n.callContactName.toUpperCase()),
            TextField(controller: _contactName),
            const SizedBox(height: 12),
            _label(l10n.callContactPosition.toUpperCase()),
            TextField(controller: _contactPosition),
            const SizedBox(height: 12),
            _label(l10n.callContactPhone.toUpperCase()),
            TextField(controller: _contactPhone, keyboardType: TextInputType.phone),
            const SizedBox(height: 18),
            _label(l10n.callDescription.toUpperCase()),
            TextField(controller: _description, maxLines: 4),
            const SizedBox(height: 10),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _unusualDamage,
              onChanged: (v) => setState(() => _unusualDamage = v ?? false),
              title: Text(l10n.callUnusualDamage),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.stamp, fontSize: 13)),
            ],
            const SizedBox(height: 18),
            FilledButton.icon(
              icon: _saving
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check, size: 18),
              label: Text(_saving ? l10n.callSaving : l10n.callSubmit),
              onPressed: _saving ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
