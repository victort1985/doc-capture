import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../store/app_state.dart';
import '../widgets/copyright_notice.dart';
import '../widgets/stamp_mark.dart';
import 'connection_settings_screen.dart';
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
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const RootScreen()),
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
        setState(() => _error = l10n.signInConnectionError);
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
                              child: const StampMark(size: 46),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(l10n.appTitle,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.headlineSmall),
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
