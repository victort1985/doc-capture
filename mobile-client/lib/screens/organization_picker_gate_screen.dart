import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';

/// main.dart's own top-level route whenever the account is logged in
/// but hasn't confirmed an organization yet (AppState.orgConfirmed is
/// false) — see main.dart's routing logic and AppState.orgConfirmed's
/// own doc comment for why this lives at that level rather than being
/// pushed from login_screen.dart (an earlier version did exactly
/// that, and it turned out to be skippable by anything that set
/// currentUser a different way — this is what actually makes the
/// picker mandatory). Blocks proceeding into the app until one
/// organization is picked, so every document created this session
/// (calls, quotes, invoices, everything) has a clear home from the
/// very start rather than silently defaulting to whichever org
/// happened to be active last time or the account's own primary org
/// without the person realizing it. Auto-confirmed (never actually
/// shown) for an account with 0 or 1 organizations — nothing to pick.
class OrganizationPickerGateScreen extends StatefulWidget {
  const OrganizationPickerGateScreen({super.key});

  @override
  State<OrganizationPickerGateScreen> createState() => _OrganizationPickerGateScreenState();
}

class _OrganizationPickerGateScreenState extends State<OrganizationPickerGateScreen> {
  int? _selectedId;

  @override
  void initState() {
    super.initState();
    // Pre-select whatever AppState already defaulted to (the
    // account's own primary org) so "Continue" works immediately
    // without forcing an explicit tap if the default is already fine
    // — the person can still change it before continuing.
    _selectedId = context.read<AppState>().activeOrganizationId;
  }

  void _continue() {
    final appState = context.read<AppState>();
    final orgs = appState.switchableOrgs;
    final match = orgs.firstWhere(
      (o) => o['id'] == _selectedId,
      orElse: () => orgs.isNotEmpty ? orgs.first : {},
    );
    final id = match['id'] as int?;
    final name = match['name'] as String?;
    if (id != null && name != null) {
      appState.switchOrganization(id, name);
    }
    // This screen is main.dart's own top-level route now (see that
    // file's routing logic), not something pushed onto a navigator
    // stack — "dismissing" it means flipping AppState.orgConfirmed,
    // which makes main.dart's own reactive rebuild swap this out for
    // RootScreen on its own. Nothing to pop here anymore.
    appState.confirmOrganization();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final orgs = context.watch<AppState>().switchableOrgs;

    return PopScope(
      // Same reasoning as TermsOfServiceGateScreen — this isn't
      // something to dismiss with the back button, only by picking an
      // organization and continuing.
      canPop: false,
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.orgPickerGateTitle), automaticallyImplyLeading: false),
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Text(
                  l10n.orgPickerGateSubtitle,
                  style: const TextStyle(fontSize: 13.5, color: AppColors.inkSoft, height: 1.4),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  itemCount: orgs.length,
                  itemBuilder: (context, index) {
                    final org = orgs[index];
                    final id = org['id'] as int;
                    final name = org['name'] as String? ?? '—';
                    final isSelected = id == _selectedId;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => setState(() => _selectedId = id),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            color: isSelected ? AppColors.primaryWash : Colors.transparent,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: isSelected ? AppColors.primary : AppColors.inkSoft.withOpacity(0.25),
                              width: isSelected ? 1.5 : 1,
                            ),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 36, height: 36,
                                decoration: BoxDecoration(
                                  color: isSelected ? AppColors.primary : AppColors.primaryWash,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Icon(Icons.business, size: 18, color: isSelected ? Colors.white : AppColors.primary),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  name,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                    color: isSelected ? AppColors.primary : null,
                                  ),
                                ),
                              ),
                              if (isSelected) Icon(Icons.check_circle, color: AppColors.primary, size: 20),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _selectedId != null ? _continue : null,
                    child: Text(l10n.orgPickerGateContinue),
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
