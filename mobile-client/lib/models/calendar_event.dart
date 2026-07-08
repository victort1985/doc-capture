class CalendarAttachment {
  final int id;
  final String originalName;
  final String? mimetype;
  final DateTime createdAt;

  CalendarAttachment({
    required this.id,
    required this.originalName,
    this.mimetype,
    required this.createdAt,
  });

  bool get isPhoto => mimetype?.startsWith('image/') == true;

  factory CalendarAttachment.fromJson(Map<String, dynamic> json) =>
      CalendarAttachment(
        id: json['id'],
        originalName: json['originalName'] ?? '',
        mimetype: json['mimetype'],
        createdAt: DateTime.parse(json['createdAt']),
      );
}

enum CalendarEventType { event, task }
enum CalendarEventRepeat { none, daily, weekly, monthly, yearly }

CalendarEventType eventTypeFromJson(String v) =>
    v == 'task' ? CalendarEventType.task : CalendarEventType.event;

CalendarEventRepeat repeatFromJson(String v) {
  switch (v) {
    case 'daily': return CalendarEventRepeat.daily;
    case 'weekly': return CalendarEventRepeat.weekly;
    case 'monthly': return CalendarEventRepeat.monthly;
    case 'yearly': return CalendarEventRepeat.yearly;
    default: return CalendarEventRepeat.none;
  }
}

String repeatToJson(CalendarEventRepeat r) {
  switch (r) {
    case CalendarEventRepeat.daily: return 'daily';
    case CalendarEventRepeat.weekly: return 'weekly';
    case CalendarEventRepeat.monthly: return 'monthly';
    case CalendarEventRepeat.yearly: return 'yearly';
    default: return 'none';
  }
}

class CalendarEvent {
  final int id;
  final CalendarEventType type;
  final String title;
  final String? description;
  final DateTime startAt;
  final DateTime? endAt;
  final bool allDay;
  final bool done;
  final String? location;
  final String? contactPerson;
  final String? color;
  final CalendarEventRepeat repeat;
  final String? technicalRequirements;
  final String? requiredEquipment;
  final String? createdByUsername;
  final List<CalendarAttachment> attachments;
  final DateTime createdAt;

  CalendarEvent({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    required this.startAt,
    this.endAt,
    required this.allDay,
    required this.done,
    this.location,
    this.contactPerson,
    this.color,
    required this.repeat,
    this.technicalRequirements,
    this.requiredEquipment,
    this.createdByUsername,
    this.attachments = const [],
    required this.createdAt,
  });

  factory CalendarEvent.fromJson(Map<String, dynamic> json) => CalendarEvent(
        id: json['id'],
        type: eventTypeFromJson(json['type'] ?? 'event'),
        title: json['title'] ?? '',
        description: json['description'],
        startAt: DateTime.parse(json['startAt']),
        endAt: json['endAt'] != null ? DateTime.parse(json['endAt']) : null,
        allDay: json['allDay'] ?? false,
        done: json['done'] ?? false,
        location: json['location'],
        contactPerson: json['contactPerson'],
        color: json['color'],
        repeat: repeatFromJson(json['repeat'] ?? 'none'),
        technicalRequirements: json['technicalRequirements'],
        requiredEquipment: json['requiredEquipment'],
        createdByUsername: json['createdBy']?['username'],
        attachments: (json['attachments'] as List<dynamic>? ?? [])
            .map((a) => CalendarAttachment.fromJson(a as Map<String, dynamic>))
            .toList(),
        createdAt: DateTime.parse(json['createdAt']),
      );
}
