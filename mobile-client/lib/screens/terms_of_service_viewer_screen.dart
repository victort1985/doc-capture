import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../widgets/terms_of_service_content.dart';

class TermsOfServiceViewerScreen extends StatelessWidget {
  const TermsOfServiceViewerScreen({super.key, required this.language});
  final String language;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsViewTos)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: TermsOfServiceContent(language: language),
        ),
      ),
    );
  }
}
