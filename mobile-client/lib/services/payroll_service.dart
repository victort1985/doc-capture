import '../services/api_service.dart';

class HourCategories {
  final double regular;
  final double overtimeTier1;
  final double overtimeTier2;
  final double restDay;
  final double restDayOvertimeTier1;
  final double restDayOvertimeTier2;

  HourCategories({
    required this.regular,
    required this.overtimeTier1,
    required this.overtimeTier2,
    required this.restDay,
    required this.restDayOvertimeTier1,
    required this.restDayOvertimeTier2,
  });

  factory HourCategories.fromJson(Map<String, dynamic> j) => HourCategories(
        regular: (j['regular'] as num).toDouble(),
        overtimeTier1: (j['overtimeTier1'] as num).toDouble(),
        overtimeTier2: (j['overtimeTier2'] as num).toDouble(),
        restDay: (j['restDay'] as num).toDouble(),
        restDayOvertimeTier1: (j['restDayOvertimeTier1'] as num).toDouble(),
        restDayOvertimeTier2: (j['restDayOvertimeTier2'] as num).toDouble(),
      );

  double get total => regular + overtimeTier1 + overtimeTier2 + restDay + restDayOvertimeTier1 + restDayOvertimeTier2;
}

class TimekeeperShift {
  final int entryId;
  final String date;
  final DateTime clockIn;
  final DateTime clockOut;
  final HourCategories hours;

  TimekeeperShift({required this.entryId, required this.date, required this.clockIn, required this.clockOut, required this.hours});

  factory TimekeeperShift.fromJson(Map<String, dynamic> j) => TimekeeperShift(
        entryId: j['entryId'],
        date: j['date'],
        clockIn: DateTime.parse(j['clockIn']),
        clockOut: DateTime.parse(j['clockOut']),
        hours: HourCategories.fromJson(j),
      );
}

class TimekeeperPeriod {
  final List<TimekeeperShift> shifts;
  final HourCategories total;

  TimekeeperPeriod({required this.shifts, required this.total});

  factory TimekeeperPeriod.fromJson(Map<String, dynamic> j) => TimekeeperPeriod(
        shifts: (j['shifts'] as List).map((s) => TimekeeperShift.fromJson(s as Map<String, dynamic>)).toList(),
        total: HourCategories.fromJson(j['total'] as Map<String, dynamic>),
      );
}

class PayslipLine {
  final String category;
  final double hours;
  final double ratePercent;
  final double amount;

  PayslipLine({required this.category, required this.hours, required this.ratePercent, required this.amount});

  factory PayslipLine.fromJson(Map<String, dynamic> j) => PayslipLine(
        category: j['category'],
        hours: (j['hours'] as num).toDouble(),
        ratePercent: (j['ratePercent'] as num).toDouble(),
        amount: (j['amount'] as num).toDouble(),
      );
}

class Payslip {
  final String username;
  final String periodFrom;
  final String periodTo;
  final String salaryType;
  final List<PayslipLine> lines;
  final double grossPay;

  Payslip({
    required this.username,
    required this.periodFrom,
    required this.periodTo,
    required this.salaryType,
    required this.lines,
    required this.grossPay,
  });

  factory Payslip.fromJson(Map<String, dynamic> j) => Payslip(
        username: j['username'],
        periodFrom: j['period']['from'],
        periodTo: j['period']['to'],
        salaryType: j['salaryType'],
        lines: (j['lines'] as List).map((l) => PayslipLine.fromJson(l as Map<String, dynamic>)).toList(),
        grossPay: (j['grossPay'] as num).toDouble(),
      );
}

/// Self-service only — GET /payroll/my-timekeeper and my-payslip both
/// read the caller's own id server-side (see
/// PayrollSelfServiceController's own doc comment); there's no
/// endpoint here that could show another employee's data even by
/// mistake, since neither call ever sends a userId at all.
class PayrollService {
  final ApiService _api;
  PayrollService(this._api);

  Future<TimekeeperPeriod> getMyTimekeeper(String from, String to) async {
    final data = await _api.get('/payroll/my-timekeeper', query: {'from': from, 'to': to});
    return TimekeeperPeriod.fromJson(data as Map<String, dynamic>);
  }

  Future<Payslip> getMyPayslip(String from, String to) async {
    final data = await _api.get('/payroll/my-payslip', query: {'from': from, 'to': to});
    return Payslip.fromJson(data as Map<String, dynamic>);
  }
}
