import 'package:flutter/material.dart';
import 'l10n/app_localizations.dart';

/// Shown once per app session (not persisted across restarts — a
/// fresh reminder each time someone opens the app is appropriate for
/// a demo account) right after a successful login to a demo-mode
/// organization.
Future<void> showDemoConsentDialog(BuildContext context) async {
  final l10n = AppLocalizations.of(context)!;
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      title: Text(l10n.demoNoticeTitle),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.demoNoticeIntro),
            const SizedBox(height: 14),
            Text(l10n.demoNoticeDisabledTitle, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            Text('• ${l10n.demoNoticeDisabled1}', style: const TextStyle(fontSize: 13)),
            Text('• ${l10n.demoNoticeDisabled2}', style: const TextStyle(fontSize: 13)),
            Text('• ${l10n.demoNoticeDisabled3}', style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 14),
            Text(l10n.demoNoticeDeletionWarning, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFFB3261E))),
          ],
        ),
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: Text(l10n.demoNoticeAgree),
        ),
      ],
    ),
  );
}
