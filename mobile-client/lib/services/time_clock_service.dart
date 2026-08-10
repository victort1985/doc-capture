import '../services/api_service.dart';

class TimeClockShift {
  final int id;
  final DateTime clockIn;
  final DateTime? clockOut;
  final String? notes;

  TimeClockShift({required this.id, required this.clockIn, this.clockOut, this.notes});

  factory TimeClockShift.fromJson(Map<String, dynamic> j) => TimeClockShift(
        id: j['id'],
        clockIn: DateTime.parse(j['clockIn']),
        clockOut: j['clockOut'] != null ? DateTime.parse(j['clockOut']) : null,
        notes: j['notes'],
      );
}

/// Thin wrapper around /time-clock — matches the same "service takes
/// an ApiService, constructed inline in the screen that needs it"
/// pattern as ExpensesService/PaymentsService etc. rather than being
/// registered in main.dart's MultiProvider (that list is reserved for
/// services with actual app-lifetime state to hold, which this
/// doesn't have).
class TimeClockService {
  final ApiService _api;
  TimeClockService(this._api);

  /// Null means not currently clocked in — matches the backend's own
  /// GET /time-clock/my-status, which returns null (not a 404) for
  /// "no open shift", since "not clocked in" is a normal, expected
  /// state, not an error. Checking `data is! Map` rather than just
  /// `data == null` — a null JSON body can arrive through Dio as an
  /// empty string rather than Dart null depending on how the empty
  /// response gets content-typed, and a bare `== null` check let that
  /// slip through to the fromJson cast below, which then failed with
  /// a genuinely confusing "String is not a subtype of Map" error
  /// instead of correctly reading it as "no open shift" (found via a
  /// real-device screenshot after this shipped — the exact case the
  /// missing Flutter toolchain in the build sandbox couldn't catch).
  Future<TimeClockShift?> myStatus() async {
    final data = await _api.get('/time-clock/my-status');
    if (data is! Map<String, dynamic>) return null;
    return TimeClockShift.fromJson(data);
  }

  Future<TimeClockShift> clockIn() async {
    final data = await _api.post('/time-clock/clock-in', {});
    return TimeClockShift.fromJson(data);
  }

  Future<TimeClockShift> clockOut({String? notes}) async {
    final data = await _api.post('/time-clock/clock-out', {
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    return TimeClockShift.fromJson(data);
  }
}
