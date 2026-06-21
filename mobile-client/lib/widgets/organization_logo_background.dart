import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';

/// Renders the current user's organization logo as a faint background —
/// "фон с прозрачностью 80 процентов" (80% transparency, i.e. 20%
/// opacity — faint enough to sit behind real content without competing
/// with it). Naturally shows nothing for a super-admin (no organization)
/// or an organization with no logo uploaded yet — /organizations/my-logo
/// 404s in both cases, which this treats as "no background" rather than
/// an error.
///
/// Fetched once per RootScreen lifetime (not re-fetched per tab switch)
/// since the logo can't change without logging out/in again.
class OrganizationLogoBackground extends StatefulWidget {
  const OrganizationLogoBackground({super.key, required this.child});
  final Widget child;

  @override
  State<OrganizationLogoBackground> createState() => _OrganizationLogoBackgroundState();
}

class _OrganizationLogoBackgroundState extends State<OrganizationLogoBackground> {
  Uint8List? _logoBytes;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final bytes = await context.read<ApiService>().getBytes('/organizations/my-logo');
      if (mounted) setState(() => _logoBytes = bytes);
    } catch (_) {
      // No organization, or no logo uploaded — just show no background.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_logoBytes == null) return widget.child;
    return Stack(
      children: [
        Positioned.fill(
          child: Opacity(
            opacity: 0.2,
            child: Image.memory(_logoBytes!, fit: BoxFit.cover),
          ),
        ),
        widget.child,
      ],
    );
  }
}
