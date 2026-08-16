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

  /// Backfills a whole shift at once (start AND end already known) —
  /// gated server-side by the payroll.manageTimeClockEntries
  /// permission (see TimeClockController's own POST /time-clock/
  /// manual-entry), never something every employee can do. The
  /// overnight-shift rule (end time-of-day not after start time-of-
  /// day means the shift crosses midnight, landing on the day AFTER
  /// `date`) is applied entirely server-side — this method just
  /// passes through the plain date/startTime/endTime strings exactly
  /// as entered, matching the admin panel's own equivalent form.
  Future<void> createManualEntry({
    required int userId,
    required String date,
    required String startTime,
    required String endTime,
  }) async {
    await _api.post('/time-clock/manual-entry', {
      'userId': userId,
      'date': date,
      'startTime': startTime,
      'endTime': endTime,
    });
  }

  /// Corrects an existing shift's clock-in/out — same
  /// payroll.manageTimeClockEntries permission gate server-side as
  /// createManualEntry above (see TimeClockController's own PATCH
  /// /time-clock/:id). Takes full ISO datetimes (not plain date/time
  /// strings like createManualEntry) since the shift being edited
  /// already HAS a specific date attached to each end — there's no
  /// "which day does this land on" ambiguity to resolve server-side
  /// the way a brand-new entry has.
  Future<void> editEntry({required int entryId, required DateTime clockIn, required DateTime clockOut}) async {
    await _api.patch('/time-clock/$entryId', {
      'clockIn': clockIn.toIso8601String(),
      'clockOut': clockOut.toIso8601String(),
    });
  }
}
