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
  const OrganizationLogoBackground({
    super.key,
    required this.child,
    this.fit = BoxFit.cover,
    this.backgroundColor,
  });
  final Widget child;

  /// How the logo image is scaled. Defaults to [BoxFit.cover] (mobile).
  /// Desktop uses [BoxFit.fitHeight] so the logo spans the full window
  /// height without ever stretching its width out of proportion.
  final BoxFit fit;

  /// Solid color painted behind the faint logo, in front of whatever
  /// sits behind this widget (e.g. a dark sidebar). Null keeps the
  /// previous fully-transparent behavior.
  final Color? backgroundColor;

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
        if (widget.backgroundColor != null)
          Positioned.fill(child: ColoredBox(color: widget.backgroundColor!)),
        Positioned.fill(
          child: Opacity(
            opacity: 0.2,
            child: Image.memory(_logoBytes!, fit: widget.fit),
          ),
        ),
        widget.child,
      ],
    );
  }
}
