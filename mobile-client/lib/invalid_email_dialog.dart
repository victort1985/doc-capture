import 'package:flutter/material.dart';
import 'l10n/app_localizations.dart';

/// Shows a dialog when the client email field has something typed
/// but it isn't a valid email address. Returns true if the user chose
/// to skip (proceed without an email), false if they chose to go back
/// and fix it (or dismissed the dialog).
Future<bool> confirmInvalidEmail(BuildContext context) async {
  final l10n = AppLocalizations.of(context)!;
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(l10n.invalidEmailTitle),
      content: Text(l10n.invalidEmailBody),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(l10n.invalidEmailFix)),
        TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(l10n.invalidEmailSkip)),
      ],
    ),
  );
  return result ?? false;
}
