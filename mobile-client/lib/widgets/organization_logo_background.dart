import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../app/theme.dart';

/// Renders the current user's organization logo as a faint background —
/// "фон с прозрачностью 80 процентов" (80% transparency, i.e. 20%
/// opacity — faint enough to sit behind real content without competing
/// with it). Naturally shows no logo overlay for a super-admin (no
/// organization) or an organization with no logo uploaded yet —
/// /organizations/my-logo 404s in both cases, treated as "no logo" —
/// but ALWAYS paints a solid base color regardless, since a screen
/// reached via Navigator.push (rather than embedded in
/// root_screen.dart's own IndexedStack, which sits inside a Scaffold
/// already themed to AppColors.bg) has nothing else behind it to show
/// through a transparent Scaffold; returning the bare child with zero
/// painting left those routes showing raw black canvas whenever no
/// logo existed to paint over it.
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

  /// Solid color painted as the base layer, in front of whatever sits
  /// behind this widget (e.g. a dark sidebar) and behind the faint
  /// logo overlay. Defaults to the app's own light theme background
  /// (AppColors.bg) rather than null/transparent, so this widget is
  /// always a safe, complete backdrop on its own — never dependent on
  /// some other ancestor happening to paint a color first.
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
      // No organization, or no logo uploaded — just show no logo overlay.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(child: ColoredBox(color: widget.backgroundColor ?? AppColors.bg)),
        if (_logoBytes != null)
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
