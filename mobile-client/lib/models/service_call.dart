enum CallUrgency { urgent, notUrgent }

CallUrgency urgencyFromJson(String v) => v == 'urgent' ? CallUrgency.urgent : CallUrgency.notUrgent;
String urgencyToJson(CallUrgency u) => u == CallUrgency.urgent ? 'urgent' : 'not_urgent';

enum CallStatus { open, inProgress, closed }

CallStatus statusFromJson(String v) {
  switch (v) {
    case 'in_progress':
      return CallStatus.inProgress;
    case 'closed':
      return CallStatus.closed;
    default:
      return CallStatus.open;
  }
}

String statusToJson(CallStatus s) {
  switch (s) {
    case CallStatus.inProgress:
      return 'in_progress';
    case CallStatus.closed:
      return 'closed';
    case CallStatus.open:
      return 'open';
  }
}

class ServiceCall {
  final int id;
  final String place;
  final double? latitude;
  final double? longitude;
  final CallUrgency urgency;
  final String contactName;
  final String contactPosition;
  final String contactPhone;
  final String description;
  final bool unusualDamage;
  final CallStatus status;
  final String createdByUsername;
  final String? statusChangedByUsername;
  final DateTime? statusChangedAt;
  final String? closedByUsername;
  final DateTime createdAt;

  ServiceCall({
    required this.id,
    required this.place,
    this.latitude,
    this.longitude,
    required this.urgency,
    required this.contactName,
    required this.contactPosition,
    required this.contactPhone,
    required this.description,
    required this.unusualDamage,
    required this.status,
    required this.createdByUsername,
    this.statusChangedByUsername,
    this.statusChangedAt,
    this.closedByUsername,
    required this.createdAt,
  });

  factory ServiceCall.fromJson(Map<String, dynamic> json) => ServiceCall(
        id: json['id'],
        place: json['place'],
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        urgency: urgencyFromJson(json['urgency']),
        contactName: json['contactName'],
        contactPosition: json['contactPosition'],
        contactPhone: json['contactPhone'],
        description: json['description'],
        unusualDamage: json['unusualDamage'] ?? false,
        status: statusFromJson(json['status']),
        createdByUsername: json['createdBy']?['username'] ?? '',
        statusChangedByUsername: json['statusChangedBy']?['username'],
        statusChangedAt: json['statusChangedAt'] != null ? DateTime.parse(json['statusChangedAt']) : null,
        closedByUsername: json['closedBy']?['username'],
        createdAt: DateTime.parse(json['createdAt']),
      );
}

class CallNote {
  final int id;
  final String? text;
  final String authorUsername;
  final bool hasPhoto;
  final DateTime createdAt;

  CallNote({
    required this.id,
    this.text,
    required this.authorUsername,
    required this.hasPhoto,
    required this.createdAt,
  });

  factory CallNote.fromJson(Map<String, dynamic> json) => CallNote(
        id: json['id'],
        text: json['text'],
        authorUsername: json['author']?['username'] ?? '',
        hasPhoto: json['photoRelativePath'] != null,
        createdAt: DateTime.parse(json['createdAt']),
      );
}

class CallAttachment {
  final int id;
  final String originalName;
  final String generatedName;
  final String uploadedByUsername;
  final DateTime createdAt;

  CallAttachment({
    required this.id,
    required this.originalName,
    required this.generatedName,
    required this.uploadedByUsername,
    required this.createdAt,
  });

  factory CallAttachment.fromJson(Map<String, dynamic> json) => CallAttachment(
        id: json['id'],
        originalName: json['originalName'],
        generatedName: json['generatedName'],
        uploadedByUsername: json['uploadedBy']?['username'] ?? '',
        createdAt: DateTime.parse(json['createdAt']),
      );
}
