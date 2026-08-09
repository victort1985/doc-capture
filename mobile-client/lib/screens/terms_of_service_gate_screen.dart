import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../store/app_state.dart';
import '../widgets/terms_of_service_content.dart';

/// Shown at the app's own root level (see main.dart's reactive
/// routing) whenever the logged-in user's own tosAccepted is false —
/// structurally unreachable to bypass, no matter how currentUser got
/// set, matching the same pattern OrganizationPickerGateScreen uses
/// for the exact same reason. PopScope still blocks the back button
/// as a second line of defense, though there's no meaningful "back"
/// destination at the root level anyway.
class TermsOfServiceGateScreen extends StatefulWidget {
  const TermsOfServiceGateScreen({super.key, required this.language});
  final String language;

  @override
  State<TermsOfServiceGateScreen> createState() => _TermsOfServiceGateScreenState();
}

class _TermsOfServiceGateScreenState extends State<TermsOfServiceGateScreen> {
  bool _checked = true;
  bool _saving = false;
  String? _error;

  /// Pure root-level widget now (see main.dart's own routing) — not
  /// pushed via Navigator.push and awaited the way it used to be, so
  /// there's nothing to pop here. Once refreshCurrentUser() updates
  /// currentUser.tosAccepted and notifies listeners, main.dart's own
  /// reactive routing swaps this screen away automatically — same
  /// mechanism OrganizationPickerGateScreen already uses via
  /// confirmOrganization() for the exact same reason.
  Future<void> _accept() async {
    setState(() { _saving = true; _error = null; });
    try {
      await context.read<ApiService>().post('/auth/accept-tos', {});
      if (!mounted) return;
      await context.read<AppState>().refreshCurrentUser();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.tosGateTitle), automaticallyImplyLeading: false),
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Text(l10n.tosGateIntro, style: TextStyle(color: Colors.grey.shade700, fontSize: 13.5)),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SingleChildScrollView(
                    child: TermsOfServiceContent(language: widget.language),
                  ),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _checked,
                  onChanged: (v) => setState(() => _checked = v),
                  title: Text(l10n.tosCheckboxLabel, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                  subtitle: Text(l10n.tosDontShowAgainHint, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: (_checked && !_saving) ? _accept : null,
                    child: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l10n.tosAccept),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
