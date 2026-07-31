import '../services/api_service.dart';

/// Backs the app-wide "how urgent is this" color rule — see the
/// backend's TimeThresholdSettings entity for the full rationale.
/// Fetched once and reused everywhere a list needs to color-code by
/// deadline, rather than each screen re-fetching its own copy.
class TimeThresholds {
  final int callsWarningHours;
  final int callsDangerHours;
  final int vehicleWarningDays;
  final int vehicleDangerDays;
  final int rentalWarningDays;
  final int rentalDangerDays;

  const TimeThresholds({
    this.callsWarningHours = 24,
    this.callsDangerHours = 72,
    this.vehicleWarningDays = 30,
    this.vehicleDangerDays = 7,
    this.rentalWarningDays = 3,
    this.rentalDangerDays = 1,
  });

  factory TimeThresholds.fromJson(Map<String, dynamic> j) => TimeThresholds(
        callsWarningHours: j['callsWarningHours'] ?? 24,
        callsDangerHours: j['callsDangerHours'] ?? 72,
        vehicleWarningDays: j['vehicleWarningDays'] ?? 30,
        vehicleDangerDays: j['vehicleDangerDays'] ?? 7,
        rentalWarningDays: j['rentalWarningDays'] ?? 3,
        rentalDangerDays: j['rentalDangerDays'] ?? 1,
      );
}

class TimeThresholdsService {
  TimeThresholdsService(this._api);
  final ApiService _api;

  /// Falls back to the same defaults the backend entity itself uses
  /// on any failure (no org, network hiccup, etc) — color-coding
  /// degrading to sensible defaults is much better than a list screen
  /// crashing or showing no colors at all over a settings fetch
  /// failure.
  Future<TimeThresholds> get() async {
    try {
      final res = await _api.get('/time-thresholds');
      if (res == null) return const TimeThresholds();
      return TimeThresholds.fromJson(res as Map<String, dynamic>);
    } catch (_) {
      return const TimeThresholds();
    }
  }
}
