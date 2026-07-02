import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../store/app_state.dart';
import '../app/theme.dart';

/// Compact organization selector shown at the top of the Stock (Inventory) screen.
/// Only visible when user has [orgs.switch] permission AND more than one org available.
class OrgSwitcherBar extends StatelessWidget {
  const OrgSwitcherBar({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final user = appState.currentUser;
    if (user == null) return const SizedBox.shrink();

    // Only show if user has permission and has more than one org available
    final canSwitch = user.hasPermission('orgs.switch') ||
        user.role == 'admin' ||
        user.organizationId == null;
    final orgs = appState.switchableOrgs;
    if (!canSwitch || orgs.length <= 1) return const SizedBox.shrink();

    final activeId = appState.activeOrganizationId;
    final activeName = appState.activeOrganizationName ?? '—';

    return Container(
      margin: const EdgeInsets.fromLTRB(0, 0, 0, 12),
      decoration: BoxDecoration(
        color: AppColors.primaryWash,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withOpacity(0.15)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showOrgPicker(context, appState, orgs, activeId),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.business, color: Colors.white, size: 17),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Active organization',
                      style: TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600,
                        color: AppColors.inkSoft,
                        letterSpacing: 0.3,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      activeName,
                      style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.unfold_more, color: AppColors.primary, size: 20),
            ],
          ),
        ),
      ),
    );
  }

  void _showOrgPicker(
    BuildContext context,
    AppState appState,
    List<Map<String, dynamic>> orgs,
    int? activeId,
  ) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 40, height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(children: [
              Icon(Icons.business, size: 18),
              SizedBox(width: 8),
              Text('Select organization',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ]),
          ),
          const Divider(height: 1),
          ...orgs.map((org) {
            final id = org['id'] as int;
            final name = org['name'] as String? ?? '—';
            final isActive = id == activeId;
            return ListTile(
              leading: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: isActive ? AppColors.primary : AppColors.primaryWash,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.business,
                  size: 18,
                  color: isActive ? Colors.white : AppColors.primary,
                ),
              ),
              title: Text(name,
                style: TextStyle(
                  fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                  color: isActive ? AppColors.primary : null,
                ),
              ),
              trailing: isActive
                  ? Icon(Icons.check_circle, color: AppColors.primary, size: 20)
                  : null,
              onTap: () {
                Navigator.pop(ctx);
                appState.switchOrganization(id, name);
              },
            );
          }),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
