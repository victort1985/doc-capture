import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'l10n/app_localizations.dart';
import 'app/theme.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/file_service.dart';
import 'services/settings_service.dart';
import 'services/calls_service.dart';
import 'services/notifications_service.dart';
import 'store/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/root_screen.dart';

void main() {
  runApp(const DocCaptureApp());
}

class DocCaptureApp extends StatelessWidget {
  const DocCaptureApp({super.key});

  @override
  Widget build(BuildContext context) {
    final apiService = ApiService();
    final authService = AuthService(apiService);
    final settingsService = SettingsService();
    final fileService = FileService(apiService);
    final callsService = CallsService(apiService);
    final notificationsService = NotificationsService(apiService);

    return MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        Provider<FileService>.value(value: fileService),
        Provider<CallsService>.value(value: callsService),
        Provider<NotificationsService>.value(value: notificationsService),
        ChangeNotifierProvider<AppState>(
          create: (_) => AppState(settingsService, authService),
        ),
      ],
      child: const _AppRoot(),
    );
  }
}

class _AppRoot extends StatefulWidget {
  const _AppRoot();

  @override
  State<_AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<_AppRoot> {
  late final Future<void> _bootstrap;

  @override
  void initState() {
    super.initState();
    _bootstrap = context.read<AppState>().bootstrap();
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();

    return MaterialApp(
      title: 'Doc Capture',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),

      // Hebrew is the hard default (per spec), not the device locale.
      locale: Locale(appState.languageCode),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Flutter derives RTL/LTR layout automatically from `locale` above
      // (Hebrew -> RTL, English/Russian -> LTR) — no manual Directionality needed.

      home: FutureBuilder<void>(
        future: _bootstrap,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          final loggedIn = appState.currentUser != null;
          return loggedIn ? const RootScreen() : const LoginScreen();
        },
      ),
    );
  }
}
