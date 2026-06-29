import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/biometric_service.dart';
import '../store/app_state.dart';
import '../widgets/copyright_notice.dart';
import '../widgets/stamp_mark.dart';
import '../services/settings_service.dart' show SettingsService;
import 'connection_settings_screen.dart';
import 'license_agreement_screen.dart';
import 'root_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _obscure = true;
  bool _rememberMe = false;
  bool _biometricAvailable = false;

  late final AnimationController _stampController;
  late final Animation<double> _stampScale;
  late final Animation<double> _stampRotation;

  @override
  void initState() {
    super.initState();
    _stampController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _stampScale = Tween<double>(begin: 1.6, end: 1.0).animate(
      CurvedAnimation(parent: _stampController, curve: Curves.easeOutBack),
    );
    _stampRotation = Tween<double>(begin: -0.12, end: 0.0).animate(
      CurvedAnimation(parent: _stampController, curve: Curves.easeOutCubic),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _stampController.forward());
    _prefillSavedCredentials();
  }

  Future<void> _prefillSavedCredentials() async {
    final saved = await context.read<AppState>().authService.loadSavedCredentials();
    if (saved != null && mounted) {
      setState(() {
        _usernameController.text = saved.$1;
        _passwordController.text = saved.$2;
        _rememberMe = true;
      });
    }
    // Check biometric availability and auto-prompt if enabled + creds exist
    final bio = context.read<BiometricService>();
    final available = await bio.isAvailable();
    final enabled = await bio.isEnabled();
    if (mounted) setState(() => _biometricAvailable = available);
    if (available && enabled && saved != null && mounted) {
      _tryBiometric();
    }
  }

  Future<void> _tryBiometric() async {
    final ok = await context.read<BiometricService>().authenticate();
    if (!ok || !mounted) return;
    // Biometric OK — use the already-prefilled credentials to log in
    await _submit();
  }

  @override
  void dispose() {
    _stampController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() { _loading = true; _error = null; });
    try {
      final appState = context.read<AppState>();
      await appState.login(_usernameController.text.trim(), _passwordController.text);
      if (_rememberMe) {
        await appState.authService.saveCredentials(_usernameController.text.trim(), _passwordController.text);
      } else {
        await appState.authService.clearSavedCredentials();
      }
      if (!mounted) return;
      final userId = context.read<AppState>().currentUser!.id;
      final accepted = await SettingsService().hasAcceptedLicense(userId);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => accepted ? const RootScreen() : const LicenseAgreementScreen()),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      final l10n = AppLocalizations.of(context)!;
      // A 401 really is a wrong username/password — anything else (no
      // connection, TLS handshake failure, timeout, DNS failure, wrong
      // protocol/port) is a *reachability* problem and showing the generic
      // "wrong username or password" message for those was actively
      // misleading (this is exactly what happened testing http vs https on
      // a LAN address: the connection itself failed, but the message implied
      // the typed password was wrong). Surface those distinctly so the user
      // checks their connection settings instead of re-typing a password
      // that was never actually wrong.
      if (e.response?.statusCode == 401) {
        setState(() => _error = l10n.signInError);
      } else {
        // Surfacing the bare DioExceptionType name (e.g. "connectionError")
        // turned out not to be enough detail on its own — it covers many
        // genuinely different underlying failures (DNS lookup failure,
        // connection refused, TLS handshake failure, etc.), and the IPv4
        // preference fix that addressed one specific cause of it (a known
        // dart:io Happy-Eyeballs gap on dual-stack hosts) didn't resolve
        // this report, meaning something else is going on. e.error carries
        // the actual wrapped exception (typically a SocketException or
        // HandshakeException with a real OS-level message/errno) — show
        // that instead, since it's the only way to tell these apart
        // without pulling logs off the device directly.
        final status = e.response?.statusCode;
        final detail = status != null
            ? 'HTTP $status'
            : (e.error?.toString() ?? e.message ?? e.type.name);
        final trimmed = detail.length > 140 ? '${detail.substring(0, 140)}…' : detail;
        setState(() => _error = '${l10n.signInConnectionError} ($trimmed)');
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = AppLocalizations.of(context)!.signInError);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final appState = context.watch<AppState>();

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.primary, Color(0xFF142A45)],
          ),
        ),
        child: SafeArea(
          child: Stack(
            children: [
              Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 380),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(28, 36, 28, 28),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withOpacity(0.18), blurRadius: 28, offset: const Offset(0, 14)),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Center(
                            child: AnimatedBuilder(
                              animation: _stampController,
                              builder: (context, child) => Transform.scale(
                                scale: _stampScale.value,
                                child: Transform.rotate(angle: _stampRotation.value, child: child),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(18),
                                child: Image.asset('assets/icons/app_icon.png', width: 76, height: 76),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          // Styled wordmark
                          RichText(
                            textAlign: TextAlign.center,
                            text: TextSpan(
                              children: [
                                TextSpan(text: 'VIXOR', style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 26,
                                  letterSpacing: 4,
                                  color: Theme.of(context).colorScheme.onSurface,
                                )),
                                TextSpan(text: ' ERP', style: TextStyle(
                                  fontWeight: FontWeight.w300,
                                  fontSize: 22,
                                  letterSpacing: 2,
                                  color: const Color(0xFFF2701C),
                                )),
                              ],
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(l10n.loginTitle,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodySmall),
                          const SizedBox(height: 26),
                          TextField(
                            controller: _usernameController,
                            decoration: InputDecoration(
                              labelText: l10n.username,
                              prefixIcon: const Icon(Icons.person_outline, size: 20),
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _passwordController,
                            obscureText: _obscure,
                            decoration: InputDecoration(
                              labelText: l10n.password,
                              prefixIcon: const Icon(Icons.lock_outline, size: 20),
                              suffixIcon: IconButton(
                                icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 20),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Checkbox(
                                value: _rememberMe,
                                onChanged: (v) => setState(() => _rememberMe = v ?? false),
                              ),
                              GestureDetector(
                                onTap: () => setState(() => _rememberMe = !_rememberMe),
                                child: Text(l10n.rememberMe, style: const TextStyle(fontSize: 13.5)),
                              ),
                              if (_biometricAvailable) ...[
                                const Spacer(),
                                FutureBuilder<bool>(
                                  future: context.read<BiometricService>().isEnabled(),
                                  builder: (context, snap) {
                                    final enabled = snap.data ?? false;
                                    return Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(Icons.fingerprint, size: 18, color: enabled ? Theme.of(context).colorScheme.primary : AppColors.inkSoft),
                                        const SizedBox(width: 4),
                                        Switch(
                                          value: enabled,
                                          onChanged: (v) async {
                                            await context.read<BiometricService>().setEnabled(v);
                                            setState(() {});
                                          },
                                        ),
                                      ],
                                    );
                                  },
                                ),
                              ],
                            ],
                          ),
                          if (_biometricAvailable) ...[
                            const SizedBox(height: 6),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                icon: const Icon(Icons.fingerprint, size: 20),
                                label: Text(l10n.loginWithBiometrics),
                                onPressed: _tryBiometric,
                              ),
                            ),
                          ],
                          if (_error != null) ...[
                            const SizedBox(height: 14),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                color: AppColors.stampWash,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(children: [
                                const Icon(Icons.error_outline, size: 16, color: AppColors.stamp),
                                const SizedBox(width: 8),
                                Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.stamp, fontSize: 13))),
                              ]),
                            ),
                          ],
                          const SizedBox(height: 22),
                          FilledButton(
                            onPressed: _loading ? null : _submit,
                            child: _loading
                                ? const SizedBox(
                                    height: 18, width: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                  )
                                : Text(l10n.signIn),
                          ),
                          const SizedBox(height: 18),
                          DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: appState.languageCode,
                              isExpanded: true,
                              icon: const Icon(Icons.language, size: 18),
                              items: [
                                DropdownMenuItem(value: 'he', child: Text(l10n.languageHebrew)),
                                DropdownMenuItem(value: 'en', child: Text(l10n.languageEnglish)),
                                DropdownMenuItem(value: 'ru', child: Text(l10n.languageRussian)),
                              ],
                              onChanged: (code) {
                                if (code != null) appState.setLanguage(code);
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const CopyrightNotice(light: true),
              Positioned(
                top: 8,
                right: 8,
                child: IconButton(
                  icon: const Icon(Icons.settings_outlined, color: Colors.white70),
                  tooltip: l10n.connectionSettingsTitle,
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const ConnectionSettingsScreen()),
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
