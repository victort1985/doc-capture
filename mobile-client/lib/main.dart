import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'firebase_init.dart';
import 'license_gate.dart';

import 'l10n/app_localizations.dart';
import 'app/theme.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/file_service.dart';
import 'services/settings_service.dart';
import 'services/calls_service.dart';
import 'services/notifications_service.dart';
import 'services/locations_service.dart';
import 'services/phonebook_service.dart';
import 'services/push_notifications_service.dart';
import 'services/biometric_service.dart';
import 'services/calendar_service.dart';
import 'services/management_services.dart';
import 'services/delivery_notes_service.dart';
import 'services/order_service.dart';
import 'services/scan_session_service.dart';
import 'store/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/root_screen.dart';
import 'screens/eula_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initFirebaseIfMobile();
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
    final scanSessionService = ScanSessionService(apiService);
    final callsService = CallsService(apiService);
    final notificationsService = NotificationsService(apiService);
    final locationsService = LocationsService(apiService);
    final phoneBookService = PhoneBookService(apiService);
    final pushNotificationsService = PushNotificationsService(apiService);
    final biometricService = BiometricService();
    final calendarService = CalendarService(apiService);
    final fleetService = FleetService(apiService);
    final warehouseService = WarehouseService(apiService);
    final deliveryNotesService = DeliveryNotesService(apiService);
    final orderService = OrderService(apiService);

    return MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        Provider<FileService>.value(value: fileService),
        Provider<CallsService>.value(value: callsService),
        Provider<NotificationsService>.value(value: notificationsService),
        Provider<LocationsService>.value(value: locationsService),
        Provider<PhoneBookService>.value(value: phoneBookService),
        Provider<PushNotificationsService>.value(value: pushNotificationsService),
        Provider<BiometricService>.value(value: biometricService),
        Provider<CalendarService>.value(value: calendarService),
        Provider<FleetService>.value(value: fleetService),
        Provider<WarehouseService>.value(value: warehouseService),
        Provider<DeliveryNotesService>.value(value: deliveryNotesService),
        Provider<OrderService>.value(value: orderService),
        Provider<ScanSessionService>.value(value: scanSessionService),
        ChangeNotifierProvider<AppState>(
          create: (_) => AppState(settingsService, authService, apiService, pushNotificationsService),
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
      title: 'Vixor ERP',
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
          // Show EULA before login — once accepted it's stored in SharedPreferences
          return LicenseGate(
            child: _EulaGate(
              languageCode: appState.languageCode,
              child: loggedIn ? const RootScreen() : const LoginScreen(),
            ),
          );
        },
      ),
    );
  }
}

// ── EULA Gate — shows EULA before login if not yet accepted ─────────────────
class _EulaGate extends StatefulWidget {
  final Widget child;
  final String languageCode;
  const _EulaGate({required this.child, required this.languageCode});
  @override State<_EulaGate> createState() => _EulaGateState();
}

class _EulaGateState extends State<_EulaGate> {
  bool? _accepted;

  @override
  void initState() {
    super.initState();
    _checkEula();
  }

  Future<void> _checkEula() async {
    final prefs = await SharedPreferences.getInstance();
    final accepted = prefs.getBool('eula_accepted_v1') ?? false;
    if (mounted) setState(() => _accepted = accepted);
  }

  @override
  Widget build(BuildContext context) {
    if (_accepted == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!_accepted!) {
      return EulaScreen(
        languageCode: widget.languageCode,
        onAccepted: () => setState(() => _accepted = true),
      );
    }
    return widget.child;
  }
}
