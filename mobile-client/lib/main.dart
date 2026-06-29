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
import 'services/locations_service.dart';
import 'services/phonebook_service.dart';
import 'services/push_notifications_service.dart';
import 'services/biometric_service.dart';
import 'services/calendar_service.dart';
import 'services/management_services.dart';
import 'services/delivery_notes_service.dart';
import 'store/app_state.dart';
import 'services/settings_service.dart' show SettingsService;
import 'screens/login_screen.dart';
import 'screens/root_screen.dart';
import 'screens/license_agreement_screen.dart';

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
    final locationsService = LocationsService(apiService);
    final phoneBookService = PhoneBookService(apiService);
    final pushNotificationsService = PushNotificationsService(apiService);
    final biometricService = BiometricService();
    final calendarService = CalendarService(apiService);
    final fleetService = FleetService(apiService);
    final warehouseService = WarehouseService(apiService);
    final deliveryNotesService = DeliveryNotesService(apiService);

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
          final user = appState.currentUser;
          if (user == null) return const LoginScreen();
          return _LicenseGate(userId: user.id);
        },
      ),
    );
  }
}

// Checks per-user license acceptance; shows agreement screen if needed.
class _LicenseGate extends StatefulWidget {
  const _LicenseGate({required this.userId});
  final int userId;

  @override
  State<_LicenseGate> createState() => _LicenseGateState();
}

class _LicenseGateState extends State<_LicenseGate> {
  late final Future<bool> _check;

  @override
  void initState() {
    super.initState();
    _check = SettingsService().hasAcceptedLicense(widget.userId);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<bool>(
    future: _check,
    builder: (_, snap) {
      if (snap.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      return snap.data == true ? const RootScreen() : const LicenseAgreementScreen();
    },
  );
}
